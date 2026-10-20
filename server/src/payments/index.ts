import type { Config } from '../config';
import { MockPaymentProvider } from './mock';
import { PayPalProvider } from './paypal';
import type { PaymentProvider } from './types';

export function createPaymentProvider(cfg: Config): PaymentProvider {
  if (cfg.paymentsMode === 'mock') return new MockPaymentProvider(cfg.appBaseUrl);
  return new PayPalProvider({ clientId: cfg.paypalClientId, clientSecret: cfg.paypalClientSecret, baseUrl: cfg.paypalBaseUrl });
}

export * from './types';
export { MockPaymentProvider, PayPalProvider };
