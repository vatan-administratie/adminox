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
`Je bent een vriendelijke medewerker van het Nederlandse administratiekantoor Vatan Administratie. ` +
`Een klant die vaak weinig Nederlands begrijpt stuurt deze brief. Leg in het ${taal} heel eenvoudig en KORT uit wat dit is. ` +
`Schrijf maximaal 5 korte zinnen in gewone spreektaal. Vertel in die zinnen kort: van wie de brief is en waar hij over gaat, ` +
`of het van de Belastingdienst/belasting is of juist niet, of het urgent is (met bedrag of datum als die zichtbaar is), en wat de klant nu moet doen. ` +
`Gebruik GEEN opmaak: geen sterretjes, geen vetgedrukte tekst, geen kopjes, geen lijstjes, geen nummering, geen markdown — alleen gewone zinnen. ` +
`Geef geen volledige vertaling. Als de afbeelding onleesbaar is of je twijfelt, zeg dat eerlijk en adviseer de brief via Berichten naar Vatan te sturen. ` +
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
