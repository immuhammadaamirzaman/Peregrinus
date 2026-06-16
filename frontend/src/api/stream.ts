/**
 * Live migration stream via Server-Sent Events.
 *
 * The backend stream endpoint authenticates with the standard
 * `Authorization: Bearer` header, which the native `EventSource` API cannot
 * set — so we use `@microsoft/fetch-event-source`, which speaks the same SSE
 * wire format but lets us attach headers and abort cleanly.
 *
 * Server events (app/routers/stream.py): `log`, `status`, `end`.
 */
import {
  EventStreamContentType,
  fetchEventSource,
} from '@microsoft/fetch-event-source'

import { tokenStore } from '@/lib/tokens'
import type { StreamLogEvent, StreamStatusEvent } from '@/types/api'

export interface MigrationStreamHandlers {
  onLog?: (log: StreamLogEvent) => void
  onStatus?: (status: StreamStatusEvent) => void
  onEnd?: () => void
  onError?: (error: unknown) => void
}

/**
 * Open a migration log/progress stream. Returns an abort function; call it on
 * unmount to close the connection. Resolves the access token lazily at open
 * time so the freshest token is used.
 */
export function openMigrationStream(
  migrationId: string,
  handlers: MigrationStreamHandlers,
): () => void {
  const controller = new AbortController()

  fetchEventSource(`/api/v1/migrations/${migrationId}/stream`, {
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${tokenStore.getAccess() ?? ''}`,
      Accept: EventStreamContentType,
    },
    // Don't reconnect when the tab is backgrounded; the page reopens on focus.
    openWhenHidden: true,

    async onopen(response) {
      if (response.ok) return
      // 401/403/404 etc. are fatal — surface and stop retrying.
      throw new Error(`Stream failed (HTTP ${response.status}).`)
    },

    onmessage(ev) {
      if (!ev.data) return
      try {
        switch (ev.event) {
          case 'log':
            handlers.onLog?.(JSON.parse(ev.data) as StreamLogEvent)
            break
          case 'status':
            handlers.onStatus?.(JSON.parse(ev.data) as StreamStatusEvent)
            break
          case 'end':
            handlers.onEnd?.()
            controller.abort()
            break
        }
      } catch {
        // Ignore malformed frames; the next poll/status will reconcile.
      }
    },

    onclose() {
      // Server closed the stream cleanly (terminal state) — treat as end.
      handlers.onEnd?.()
    },

    onerror(err) {
      handlers.onError?.(err)
      // Returning (not throwing) lets the library back off and retry for
      // transient network blips; a thrown error above stops it permanently.
      throw err
    },
  }).catch((err) => {
    if (!controller.signal.aborted) handlers.onError?.(err)
  })

  return () => controller.abort()
}
