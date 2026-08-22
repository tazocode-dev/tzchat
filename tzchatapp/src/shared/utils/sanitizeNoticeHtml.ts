import DOMPurify from 'dompurify'

const NOTICE_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote',
  'a', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]

const NOTICE_ALLOWED_ATTR = ['href', 'title', 'colspan', 'rowspan']

export function sanitizeNoticeHtml(input?: string): string {
  return String(DOMPurify.sanitize(String(input || ''), {
    ALLOWED_TAGS: NOTICE_ALLOWED_TAGS,
    ALLOWED_ATTR: NOTICE_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  }))
}
