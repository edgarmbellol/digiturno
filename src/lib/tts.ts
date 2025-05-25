
'use client';

/**
 * Pronuncia el texto proporcionado utilizando la API de Síntesis de Voz del navegador.
 * @param text El texto a pronunciar.
 * @param lang El código de idioma (por ejemplo, 'es-ES', 'es-CO').
 * @returns Una promesa que se resuelve cuando el habla ha terminado, o se rechaza si hay un error.
 */
export function speakText(text: string, lang: string = 'es-ES'): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      // Si ya está hablando, cancelar el enunciado anterior para priorizar el nuevo.
      if (window.speechSynthesis.speaking) {
        // console.warn('Speech synthesis is already speaking. Cancelling previous utterance.');
        window.speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.pitch = 1;    // Tono de voz (0 a 2, 1 es el predeterminado)
      utterance.rate = 0.9;   // Velocidad del habla (0.1 a 10, 1 es el predeterminado)
      utterance.volume = 0.8; // Volumen (0 a 1)

      utterance.onend = () => {
        resolve();
      };

      utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        let errorMessage = 'Error en la síntesis de voz.';
        if (event.error) {
            switch (event.error) {
                case 'not-allowed':
                    errorMessage = 'La síntesis de voz no está permitida. Se requiere interacción del usuario.';
                    break;
                case 'language-unavailable':
                    errorMessage = `El idioma '${lang}' no está disponible para la síntesis de voz.`;
                    break;
                case 'voice-unavailable':
                     errorMessage = 'No hay voces disponibles para el idioma especificado.';
                     break;
                case 'audio-busy':
                    errorMessage = 'El servicio de audio está ocupado.';
                    break;
                case 'audio-hardware':
                    errorMessage = 'Error con el hardware de audio.';
                    break;
                default:
                    errorMessage = `Error de síntesis de voz: ${event.error}`;
            }
        }
        reject(new Error(errorMessage));
      };
      
      // Intenta reanudar el contexto de audio si está suspendido (importante para autoplay)
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            window.speechSynthesis.speak(utterance);
        }).catch(err => {
            console.error("Error resuming audio context for TTS:", err);
            reject(err); // Rechaza si no se puede reanudar el contexto
        });
      } else {
        window.speechSynthesis.speak(utterance);
      }

    } else {
      const noSupportMessage = 'La síntesis de voz no es compatible con este navegador.';
      console.warn(noSupportMessage);
      reject(new Error(noSupportMessage));
    }
  });
}
