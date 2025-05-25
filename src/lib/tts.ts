
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
      if (window.speechSynthesis.speaking) {
        console.log('Speech synthesis está ocupado, cancelando habla anterior.');
        window.speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.pitch = 1;
      utterance.rate = 0.9;
      utterance.volume = 0.8;

      utterance.onend = () => {
        console.log("Utterance.onend");
        resolve();
      };

      utterance.onerror = (event) => {
        let errorMessage = 'Error en la síntesis de voz.';
        if (event.error) {
            switch (event.error) {
                case 'not-allowed':
                    errorMessage = 'La síntesis de voz no está permitida por el navegador. Podría requerirse interacción del usuario o permisos explícitos.';
                    break;
                case 'language-unavailable':
                    errorMessage = `El idioma '${lang}' no está disponible para la síntesis de voz en este navegador/dispositivo.`;
                    break;
                case 'voice-unavailable':
                     errorMessage = 'No hay voces disponibles para el idioma especificado en este navegador/dispositivo.';
                     break;
                case 'audio-busy':
                    errorMessage = 'El servicio de audio del sistema está ocupado.';
                    break;
                case 'audio-hardware':
                    errorMessage = 'Error con el hardware de audio del sistema.';
                    break;
                case 'network':
                    errorMessage = 'Error de red al intentar cargar recursos de voz.';
                    break;
                case 'synthesis-failed':
                    errorMessage = 'Falló la síntesis del habla.';
                    break;
                case 'canceled':
                    errorMessage = 'El habla fue cancelada.';
                    console.log("Utterance.onerror: canceled");
                    resolve(); // Considerar resolver si es 'canceled' para no bloquear flujo si es intencional.
                    return;
                default:
                    errorMessage = `Error de síntesis de voz desconocido: ${event.error}`;
            }
        }
        console.error('SpeechSynthesisUtterance.onerror:', event.error, errorMessage);
        reject(new Error(errorMessage));
      };
      
      // Dejar que el navegador maneje las políticas de autoplay para speechSynthesis.
      // La interacción del usuario en la página que llama es clave.
      try {
        window.speechSynthesis.speak(utterance);
      } catch (e: any) {
        // Esto podría capturar errores si speak() se llama en un estado inválido,
        // aunque onerror del utterance es más específico para la síntesis en sí.
        console.error("Error directo al llamar a window.speechSynthesis.speak:", e);
        reject(new Error(`Error al iniciar el habla: ${e.message}`));
      }

    } else {
      const noSupportMessage = 'La síntesis de voz no es compatible con este navegador.';
      console.warn(noSupportMessage);
      reject(new Error(noSupportMessage));
    }
  });
}
