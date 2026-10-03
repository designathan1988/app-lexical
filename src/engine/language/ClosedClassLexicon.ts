import data from '../../knowledge/language/closed-class.json';

export interface ClosedClassReading {
  form: string;
  lemma: string;
  upos: string;
  feats: Record<string, string>;
  note: string;
}

const entries = (data as { entries: ClosedClassReading[] }).entries;
const byForm = new Map<string, ClosedClassReading[]>();
for (const entry of entries) {
  const key = entry.form.normalize('NFC').toLocaleLowerCase('pt-BR');
  const readings = byForm.get(key) ?? [];
  readings.push(entry);
  byForm.set(key, readings);
}

export function closedClassReadings(form: string): ClosedClassReading[] {
  return byForm.get(form.normalize('NFC').toLocaleLowerCase('pt-BR')) ?? [];
}
