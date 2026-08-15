// src/i18n/index.ts
// -------------------------------------------------------------
// 지침 §9: "기본 언어, 지원 언어, fallback 언어를 명확히 한다."
// - 이 앱은 현재 한국어 단일 서비스다. 지원 언어가 ko 하나뿐이므로
//   기본/지원/fallback 언어를 모두 'ko'로 명시한다(추측 번역을 만들지 않음).
// - 향후 다른 언어를 추가할 때는 locales/에 파일을 추가하고 SUPPORTED_LOCALES만 늘리면 된다.
// -------------------------------------------------------------
import { createI18n } from 'vue-i18n'
import ko from './locales/ko.json'

export const DEFAULT_LOCALE = 'ko'
export const SUPPORTED_LOCALES = ['ko'] as const
export const FALLBACK_LOCALE = 'ko'

export const i18n = createI18n({
  legacy: false, // Composition API(useI18n) 사용
  locale: DEFAULT_LOCALE,
  fallbackLocale: FALLBACK_LOCALE,
  messages: { ko },
})

export default i18n
