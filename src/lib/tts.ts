
'use client';

/**
 * Pronuncia el texto proporcionado utilizando la API de Síntesis de Voz del navegador.
 * @param text El texto a pronunciar.
 * @param lang El código de idioma (por ejemplo, 'es-ES', 'es-CO').
 * @returns Una promesa que se resuelve cuando el habla ha terminado, o se rechaza si hay un error.
 */
export function speakText(text: string, lang: string = 'es-ES'): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('speakText: Intentando hablar:', `"${text}"`, 'Idioma:', lang);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.speaking) {
        console.log('speakText: SpeechSynthesis ya está hablando, cancelando habla anterior.');
        window.speechSynthesis.cancel(); // Detiene cualquier habla en curso
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.pitch = 1;  // Rango 0-2, default 1
      utterance.rate = 0.9; // Rango 0.1-10, default 1
      utterance.volume = 0.8; // Rango 0-1, default 1

      // Seleccionar una voz específica si es posible y deseado
      // const voices = window.speechSynthesis.getVoices();
      // const spanishVoice = voices.find(voice => voice.lang.startsWith(lang) && voice.name.includes('Google') /* o alguna otra preferencia */);
      // if (spanishVoice) {
      //   utterance.voice = spanishVoice;
      //   console.log('speakText: Usando voz:', spanishVoice.name);
      // } else {
      //   console.log('speakText: No se encontró voz preferida, usando voz por defecto para el idioma.');
      // }

      utterance.onstart = () => {
        console.log('speakText: Utterance.onstart - El habla ha comenzado.');
      };

      utterance.onend = () => {
        console.log("speakText: Utterance.onend - El habla ha finalizado.");
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
                    errorMessage = 'Error de red al intentar cargar recursos de voz (si la voz es basada en servidor).';
                    break;
                case 'synthesis-failed':
                    errorMessage = 'Falló la síntesis del habla.';
                    break;
                case 'canceled':
                    // Si fue cancelado por una nueva llamada a speakText, esto es esperado.
                    // Si fue cancelado por otra razón, podría ser un problema.
                    console.log("speakText: Utterance.onerror - El habla fue cancelada (event.error: canceled).");
                    resolve(); // Considerar resolver si es 'canceled' para no bloquear flujo si es intencional.
                    return;
                default:
                    errorMessage = `Error de síntesis de voz desconocido: ${event.error}`;
            }
        }
        console.error('speakText: SpeechSynthesisUtterance.onerror:', event, 'Mensaje interpretado:', errorMessage);
        reject(new Error(errorMessage));
      };
      
      // Se necesita una interacción del usuario en la página para que esto funcione en muchos navegadores.
      // La página que llama a speakText debe manejar el desbloqueo del AudioContext general.
      try {
        window.speechSynthesis.speak(utterance);
      } catch (e: any) {
        console.error("speakText: Error directo al llamar a window.speechSynthesis.speak:", e);
        reject(new Error(`Error al iniciar el habla: ${e.message}`));
      }

    } else {
      const noSupportMessage = 'La síntesis de voz no es compatible con este navegador.';
      console.warn('speakText:', noSupportMessage);
      reject(new Error(noSupportMessage));
    }
  });
}
