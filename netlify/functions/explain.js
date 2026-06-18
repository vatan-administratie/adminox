// Netlify Function: leest een document/brief en legt uit in de taal van de klant.
// Plaats dit bestand in de repo als: netlify/functions/explain.js
// Stel in Netlify de environment variable GEMINI_API_KEY in (je Gemini API-sleutel).

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { text, imageBase64, mimeType, lang } = JSON.parse(event.body || '{}');
    const KEY = process.env.GEMINI_API_KEY;
    if (!KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY ontbreekt in Netlify.' }) };
    }

    const talen = { nl: 'Nederlands', en: 'English', tr: 'Turkish', bg: 'Bulgarian', ar: 'Arabic' };
    const taal = talen[lang] || 'Nederlands';

    const prompt =
`Je helpt een klant van het Nederlandse administratiekantoor Vatan Administratie. ` +
`De klant begrijpt vaak weinig Nederlands. Bekijk het document of de brief hieronder en leg het uit in het ${taal}.\n` +
`Geef in het ${taal} kort en duidelijk antwoord op:\n` +
`1) Wat voor document/brief dit is.\n` +
`2) Of het van de Belastingdienst is of belastinggerelateerd, of juist niet.\n` +
`3) Hoe belangrijk of urgent het is (en eventuele datum/bedrag als die zichtbaar is).\n` +
`4) Wat de klant concreet moet doen.\n` +
`Geef GEEN volledige vertaling, maar een korte begrijpelijke uitleg. ` +
`Als je het niet zeker weet of de afbeelding onleesbaar is, zeg dat eerlijk en adviseer de brief via Berichten naar Vatan te sturen. ` +
`Antwoord volledig in het ${taal}.`;

    const parts = [{ text: prompt }];
    if (imageBase64) {
      parts.push({ inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } });
    } else if (text) {
      parts.push({ text: 'Tekst van de brief:\n' + text });
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'Geen document of tekst meegegeven.' }) };
    }

    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });
    const data = await r.json();
    if (!r.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: (data.error && data.error.message) || 'AI-fout' }) };
    }
    const answer =
      (data.candidates && data.candidates[0] && data.candidates[0].content &&
       data.candidates[0].content.parts || [])
        .map(p => p.text).filter(Boolean).join('') || 'Geen antwoord ontvangen.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
