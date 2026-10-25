/** A read that the live boundary refuses or cannot complete, with a fixed, credential-free message. */
export class ProviderFailure extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 502, public readonly retryable = true) {
    super(message);
    this.name = 'ProviderFailure';
  }
}
