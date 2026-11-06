import { describe, it, expect } from 'vitest'
import { detectPlatform, installAvailable } from '../services/install.js'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1'
const IPHONE_INSTA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0'
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const ANDROID_WA = ANDROID + ' WhatsApp/2.24'
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

describe('instalação', () => {
  it('detecta a plataforma para escolher as instruções', () => {
    expect(detectPlatform(IPHONE, 'iPhone', 5)).toBe('ios-safari')
    expect(detectPlatform(IPHONE_CHROME, 'iPhone', 5)).toBe('ios-other')
    expect(detectPlatform(IPHONE_INSTA, 'iPhone', 5)).toBe('ios-inapp')
    expect(detectPlatform(IPAD_DESKTOP, 'MacIntel', 5)).toBe('ios-safari') // iPad em modo "computador"
    expect(detectPlatform(MAC_CHROME, 'MacIntel', 0)).toBe('desktop')
    expect(detectPlatform(ANDROID, 'Linux', 5)).toBe('android')
    expect(detectPlatform(ANDROID_WA, 'Linux', 5)).toBe('android-inapp')
  })
  it('só oferece quando não está instalado e há como instalar', () => {
    expect(installAvailable({ installed: true, canPrompt: true, platform: 'android' })).toBe(false)
    expect(installAvailable({ installed: false, canPrompt: false, platform: 'desktop' })).toBe(false)
    expect(installAvailable({ installed: false, canPrompt: true, platform: 'desktop' })).toBe(true)
    expect(installAvailable({ installed: false, canPrompt: false, platform: 'ios-safari' })).toBe(true)
  })
})
