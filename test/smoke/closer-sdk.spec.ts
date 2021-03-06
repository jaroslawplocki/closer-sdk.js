import { CloserSDK, BrowserUtils, Session, UserConfig } from '../../src';

const sessionId = '12345';
const apiKey = '54321';

describe('Initialization', () => {
  it('initialize with API key and empty config', () => {
    spyOn(BrowserUtils, 'isBrowserSupported').and.returnValue(true);
    const session = CloserSDK.init(sessionId, apiKey, {});

    expect(session.id).toBe(sessionId);
    expect(session.artichoke).toBeDefined();
    expect(BrowserUtils.isBrowserSupported).toHaveBeenCalled();

    session.artichoke.connection$.subscribe();
  });

  it('initialize with user config', () => {
    spyOn(BrowserUtils, 'isBrowserSupported').and.returnValue(true);
    const userConfig: UserConfig = {
      artichoke: {
        server: 'http://stage.anymind.com/artichoke'
      }
    };
    const session = CloserSDK.init(sessionId, apiKey, userConfig);
    expect(BrowserUtils.isBrowserSupported).toHaveBeenCalled();

    session.artichoke.connection$.subscribe();
  });

  it('fail the initialization if browser is not supported', () => {
    spyOn(BrowserUtils, 'isBrowserSupported').and.returnValue(false);

    const initFn = (): Session => CloserSDK.init(sessionId, apiKey, {});

    expect(initFn).toThrowError();
    expect(BrowserUtils.isBrowserSupported).toHaveBeenCalled();
  });
});
