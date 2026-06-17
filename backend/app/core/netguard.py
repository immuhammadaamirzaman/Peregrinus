"""Egress and local-file-access guards for user-supplied connection details.

DataMovers dials databases at hosts the user supplies and (for SQLite) opens
files at paths the user supplies. Without restriction that is an SSRF pivot
(internal hosts, cloud metadata) and an arbitrary-file read/write primitive.
These helpers centralise the validation so every outbound path —
``schema_discovery._connect_*`` and ``yaml_generator.build_dsn`` (the engine
DSN) — enforces the same policy.

* :func:`validate_outbound_host` — resolves a hostname and rejects
  private/loopback (unless allowed) and always rejects link-local
  (cloud-metadata), multicast, reserved and unspecified addresses.
* :func:`safe_sqlite_path` — confines a SQLite file path to a base directory.
* :func:`safe_cert_path` — confines a TLS cert file path to a base directory.
* :func:`validate_mongo_uri` — validates a Mongo connection URI's scheme and
  resolves/validates its hosts.
"""

from __future__ import annotations

import ipaddress
import socket
from pathlib import Path
from urllib.parse import urlsplit

from app.config import settings
from app.core.exceptions import ConnectionTestError


def _check_ip(ip_str: str, *, allow_private: bool) -> None:
    ip = ipaddress.ip_address(ip_str)
    # Loopback first: ``localhost`` resolves to 127.0.0.1 AND ::1, and Python
    # classifies ::1 as BOTH loopback and is_reserved — so it must be handled
    # here, before the reserved/always-block below, or local DBs break.
    if ip.is_loopback:
        if not allow_private:
            raise ConnectionTestError(
                "Connections to loopback addresses are not permitted."
            )
        return
    # Always-blocked ranges (for non-loopback): link-local covers the
    # cloud-metadata endpoint (169.254.169.254 / fe80::), plus
    # multicast/reserved/unspecified — blocked even when private hosts are
    # allowed in development.
    if ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
        raise ConnectionTestError(
            "The destination address is not permitted."
        )
    if ip.is_private and not allow_private:
        raise ConnectionTestError(
            "Connections to private addresses are not permitted."
        )


def validate_outbound_host(host: str | None) -> None:
    """Resolve ``host`` and reject disallowed destinations (anti-SSRF).

    Raises :class:`ConnectionTestError` if the host cannot be resolved or any
    resolved address falls in a blocked range. Validating every resolved
    address (not just the first) closes the obvious multi-record bypass; a
    narrow DNS-rebinding window between this check and the driver's own resolve
    remains (documented), but the common SSRF vectors are closed.
    """
    if not host:
        raise ConnectionTestError("A destination host is required.")

    allow_private = settings.effective_allow_private_hosts
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except OSError as exc:
        raise ConnectionTestError(f"Could not resolve host {host!r}.") from exc

    addresses = {info[4][0] for info in infos}
    if not addresses:
        raise ConnectionTestError(f"Could not resolve host {host!r}.")
    for addr in addresses:
        _check_ip(addr, allow_private=allow_private)


def _confine(raw: str, base_dir: str, *, label: str) -> str:
    """Resolve ``raw`` strictly under ``base_dir`` (created if needed)."""
    candidate = Path(raw)
    # Reject absolute paths, drive letters, and UNC up front for a clear error.
    if candidate.is_absolute() or candidate.drive or raw.startswith("\\\\"):
        raise ConnectionTestError(f"{label} must be a relative path.")

    base = Path(settings_base(base_dir)).resolve()
    base.mkdir(parents=True, exist_ok=True)
    resolved = (base / candidate).resolve()
    # Containment check: resolved must live under base (blocks ``..`` escapes).
    if base != resolved and base not in resolved.parents:
        raise ConnectionTestError(f"{label} escapes the permitted directory.")
    return str(resolved)


def settings_base(base_dir: str) -> str:
    """Resolve a configured base dir against the process CWD when relative."""
    p = Path(base_dir)
    return str(p if p.is_absolute() else Path.cwd() / p)


def safe_sqlite_path(database: str) -> str:
    """Confine a SQLite file path to ``settings.sqlite_base_dir``."""
    if not database:
        raise ConnectionTestError("A SQLite database path is required.")
    return _confine(database, settings.sqlite_base_dir, label="SQLite database path")


def safe_cert_path(filename: str) -> str:
    """Confine a TLS cert file path to ``settings.ssl_cert_dir``."""
    return _confine(filename, settings.ssl_cert_dir, label="Certificate path")


def validate_mongo_uri(uri: str) -> None:
    """Validate a user-supplied Mongo URI: known scheme + allowed hosts.

    ``mongodb+srv://`` is rejected because the SRV lookup targets an arbitrary
    attacker-chosen domain (DNS out-of-band channel) and expands to hosts we
    cannot pre-validate. Use an explicit ``mongodb://host:port`` instead.
    """
    parts = urlsplit(uri)
    if parts.scheme != "mongodb":
        raise ConnectionTestError(
            "Only 'mongodb://' connection URIs are permitted "
            "('mongodb+srv://' is not allowed)."
        )
    hosts = parts.netloc.rsplit("@", 1)[-1]  # strip user:pass@
    for hostport in hosts.split(","):
        host = hostport.rsplit(":", 1)[0].strip("[]")  # drop port, IPv6 brackets
        if host:
            validate_outbound_host(host)
