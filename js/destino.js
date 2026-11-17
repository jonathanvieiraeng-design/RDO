// Destino do relatório — módulo isolado.
// Fase 1: folha de compartilhamento do iOS (Web Share API com arquivo), com download como fallback.
// Fase 2 (futura): trocar/complementar por envio ao OneDrive via Microsoft Graph sem mexer no resto do app.

/** IMPORTANTE (iOS): chame dentro do handler de um toque, sem `await` antes, para não perder o gesto do usuário. */
export async function enviarArquivo(blob, nome, tipo = 'application/pdf') {
  const file = new File([blob], nome, { type: tipo });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nome });
      return 'compartilhado';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelado';
      console.warn('share falhou, usando download', e);
    }
  }
  baixarArquivo(blob, nome);
  return 'baixado';
}

export function podeCompartilhar(tipo = 'application/pdf') {
  try {
    const f = new File([new Blob(['x'], { type: tipo })], 'teste', { type: tipo });
    return !!(navigator.canShare && navigator.canShare({ files: [f] }));
  } catch { return false; }
}

export function baixarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
