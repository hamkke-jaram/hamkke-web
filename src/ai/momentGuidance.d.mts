export interface GuidanceOption {
  id: string;
  decision: 'WAIT' | 'OFFER' | 'CHECK' | 'SAFETY';
  action: string;
  watchFor: string;
}
export const contextGuidance: GuidanceOption;
export function guidanceOptionsFor(note: string | null | undefined): GuidanceOption[];
