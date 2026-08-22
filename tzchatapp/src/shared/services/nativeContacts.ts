import { Capacitor } from '@capacitor/core'

const PROMPTABLE = new Set(['prompt', 'prompt-with-rationale'])

export class NativeContactsPermissionError extends Error {
  constructor() {
    super('연락처 권한이 거부되었습니다. 앱 설정에서 연락처 권한을 허용한 뒤 다시 시도해 주세요.')
    this.name = 'NativeContactsPermissionError'
  }
}

export async function getNativeContactPhoneNumbers(): Promise<string[]> {
  const platform = Capacitor.getPlatform()
  if (!['android', 'ios'].includes(platform)) {
    throw new Error('웹에서는 휴대폰 연락처를 읽을 수 없습니다.')
  }

  const { Contacts } = await import('@capacitor-community/contacts')
  let permission = await Contacts.checkPermissions()
  if (PROMPTABLE.has(permission.contacts)) {
    permission = await Contacts.requestPermissions()
  }
  const hasContactAccess = permission.contacts === 'granted'
    || (platform === 'ios' && permission.contacts === 'limited')
  if (!hasContactAccess) throw new NativeContactsPermissionError()

  const result = await Contacts.getContacts({
    projection: { phones: true, name: false, organization: false, postalAddresses: false },
  })
  const numbers: string[] = []
  for (const contact of result.contacts || []) {
    for (const phone of contact.phones || []) {
      if (phone?.number) numbers.push(phone.number)
    }
  }
  if (!numbers.length) throw new Error('연락처에서 전화번호를 찾지 못했습니다.')
  return numbers
}
