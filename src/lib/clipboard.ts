import { useUi } from "@/store/ui";

export function copyText(text: string, msg?: string) {
  const toast = useUi.getState().toast;
  const fail = () => toast("No se pudo copiar: " + text);
  try {
    navigator.clipboard.writeText(text).then(() => toast(msg || "Copiado"), fail);
  } catch {
    fail();
  }
}

/** Descarga un archivo de texto (con BOM para que Excel lea bien los acentos). */
export function saveFile(name: string, text: string, type: string) {
  const toast = useUi.getState().toast;
  try {
    const u = URL.createObjectURL(new Blob(["\uFEFF" + text], { type }));
    const a = document.createElement("a");
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
    toast("Descargado: " + name);
  } catch {
    toast("No se pudo descargar en este navegador");
  }
}
