// src/types/regions.d.ts
declare module '@/shared/utils/regions' {
  // 기본/이름 내보내기 둘 다 지원하도록 선언
  const defaultExport: Record<string, string[]>;
  export default defaultExport;
  export const regions: Record<string, string[]>;
}
