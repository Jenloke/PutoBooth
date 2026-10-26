/** Round trips slower than this say more about the network than about the clocks. */
const MAX_RTT_MS = 5_000
const WINDOW = 8

interface Sample {
  rtt: number
  /** remote clock − local clock */
  offset: number
}

/**
 * Estimates the other device's clock (its performance.now()) from ping/pong round trips, the way
 * NTP does: the remote reading is assumed to be taken halfway through the round trip. The sample
 * with the shortest round trip in a recent window is the least affected by queuing, so it wins.
 */
export class ClockSync {
  private samples: Sample[] = []

  /**
   * @param sentAt local time the ping left
   * @param remoteAt remote time in the pong
   * @param receivedAt local time the pong arrived
   */
  add(sentAt: number, remoteAt: number, receivedAt: number): void {
    const rtt = receivedAt - sentAt
    if (!(rtt >= 0 && rtt <= MAX_RTT_MS)) return
    this.samples.push({ rtt, offset: remoteAt - (sentAt + receivedAt) / 2 })
    if (this.samples.length > WINDOW) this.samples.shift()
  }

  private best(): Sample | null {
    let best: Sample | null = null
    for (const sample of this.samples) if (!best || sample.rtt < best.rtt) best = sample
    return best
  }

  get synced(): boolean {
    return this.samples.length > 0
  }

  /** Remote clock − local clock, or null before the first round trip. */
  get offset(): number | null {
    return this.best()?.offset ?? null
  }

  get rtt(): number | null {
    return this.best()?.rtt ?? null
  }

  /** Converts a time on the remote clock to this device's clock. */
  toLocal(remoteTime: number): number {
    return remoteTime - (this.offset ?? 0)
  }

  reset(): void {
    this.samples = []
  }
}
