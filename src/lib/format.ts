import { env } from "@/domain/env";

export const REF = 1.2; // S/ por XLM, solo referencial
export const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

export const r2 = (x: number) => Math.round(x * 100) / 100;

export function fmt(n: number | null | undefined, d?: number): string {
  const dd = d == null ? 2 : d;
  return Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: dd, maximumFractionDigits: dd });
}
export const xlm = (n: number) => fmt(n) + " XLM";

export function fdate(iso?: string | null): string {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  return +p[2] + " " + MES[+p[1] - 1];
}
export function fdt(iso: string): string {
  const d = new Date(iso);
  return d.getDate() + " " + MES[d.getMonth()] + " · " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
const ymd = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const today = () => ymd(env.now());
export function addDays(n: number, from?: string | null): string {
  const d = from ? new Date(String(from).slice(0, 10) + "T12:00:00") : env.now();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
export const ago = (days: number) => new Date(env.now().getTime() - days * 864e5).toISOString();
export function daysTo(iso: string): number {
  const a = new Date(today() + "T00:00:00");
  const b = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 864e5);
}
export const short = (h: string) => h.slice(0, 4) + "…" + h.slice(-4);
export const initials = (n: string) =>
  String(n).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

export function juntaDayKey(iso: string): string {
  return ymd(new Date(iso));
}
export function juntaDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = env.now();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const k = juntaDayKey(iso);
  if (k === ymd(now)) return "Hoy";
  if (k === ymd(y)) return "Ayer";
  return d.getDate() + " " + MES[d.getMonth()];
}
export function juntaDateTime(iso: string): string {
  const d = new Date(iso);
  return d.getDate() + " " + MES[d.getMonth()] + ", " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
