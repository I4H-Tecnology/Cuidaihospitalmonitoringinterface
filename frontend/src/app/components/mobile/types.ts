/**
 * Tipo único do paciente no app mobile.
 *
 * Antes, MobileApp e HomeScreen declaravam cada um a sua versão de `Patient`,
 * e a do HomeScreen era mais estreita (sem temperature/bloodPressure). O
 * `onPatientClick` prometia devolver um paciente estreito para um setState que
 * exigia o completo — se o HomeScreen um dia construísse o objeto por conta
 * própria, a tela de detalhes renderizaria campos vazios.
 */
export interface MobilePatient {
  id: number;
  name: string;
  age: number;
  room: string;
  bed: string;
  status: 'normal' | 'attention' | 'critical';
  heartRate: number;
  temperature: number;
  bloodPressure: string;
  lastUpdate: string;
}
