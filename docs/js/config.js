/* =============================================================================
 * config.js — Configuración de la aplicación
 *
 * Mientras CLIENT_ID o API_URL estén vacíos la aplicación funciona en
 * MODO DEMOSTRACIÓN: no pide cuenta de Google y los datos se guardan sólo en
 * el navegador (sirve para capacitar a quien va a capturar).
 * También puede forzarse el modo demostración agregando ?demo a la dirección.
 * ============================================================================= */
window.CONFIG = {
  // ID de cliente OAuth de Google Cloud (termina en .apps.googleusercontent.com)
  CLIENT_ID: '83604596124-544v4ma7o8cvap31b299joojvatt86aa.apps.googleusercontent.com',

  // URL de la aplicación web de Apps Script (termina en /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbwe5Q0hzyB5MRn1SUGBAYuUXSTDCffK6-MErF-z15WlyvdfurH1pkkeG3SL1KpWqOMKAw/exec'
};
