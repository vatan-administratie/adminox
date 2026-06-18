// Netlify Function: legt een brief uit (mode 'uitleg') OF leest kenmerk+bedrag uit een aanslag (mode 'aanslag').
// Plaats dit bestand in de repo als: netlify/functions/explain.js
// Stel in Netlify de environment variable GEMINI_API_KEY in (je Gemini API-sleutel).

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { text, imageBase64, mimeType, lang, mode } = JSON.parse(event.body || '{}');
    const KEY = process.env.GEMINI_API_KEY;
    if (!KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY ontbreekt in Netlify.' }) };
    }

    const talen = { nl: 'Nederlands', en: 'English', tr: 'Turkish', bg: 'Bulgarian', ar: 'Arabic' };
    const taal = talen[lang] || 'Nederlands';

    let prompt;
    if (mode === 'aanslag') {
      prompt =
`Je krijgt een Nederlandse belastingaanslag van de Belastingdienst. ` +
`Zoek het AANSLAGNUMMER: dit nummer wordt gebruikt in de betalingsregeling-brief aan de Belastingdienst. ` +
`Het bestaat meestal uit cijfers met punten en achteraan een letter met cijfers, bijvoorbeeld 1234.56.789.H.66 of 8615.81.222.H.6. ` +
`Gebruik het aanslagnummer, NIET het betalingskenmerk of acceptgironummer. ` +
`Zoek daarnaast het totaal te betalen bedrag (het openstaande bedrag van de aanslag). ` +
`Antwoord ALLEEN met geldige JSON, exact zo en zonder extra tekst of opmaak: {"kenmerk":"...","bedrag":"..."}. ` +
`Schrijf het bedrag zonder euroteken (bijvoorbeeld 4.820,00). Als je iets niet kunt vinden, gebruik een lege string "".`;
    } else if (mode === 'lease') {
      prompt =
`Je krijgt een Nederlands leasecontract (auto). Haal de gegevens eruit en antwoord ALLEEN met geldige JSON, zonder extra tekst, exact zo: ` +
`{"kenteken":"","maandbedrag":0,"looptijd":0,"renteTotaal":0,"hoofdsom":0,"slottermijn":0,"startjaar":0,"startmaanden":0}. ` +
`maandbedrag = maandtermijn in euro; looptijd = aantal maanden; hoofdsom = gefinancierd bedrag / totale aflossing exclusief rente; slottermijn = eventuele slottermijn (anders 0); ` +
`renteTotaal = totale rente over de hele looptijd; als die niet expliciet vermeld staat, bereken maandbedrag*looptijd - hoofdsom; ` +
`startjaar = jaar van de ingangsdatum; startmaanden = aantal maanden vanaf de ingangsmaand tot en met december van dat jaar (ingang augustus = 5). ` +
`Gebruik een punt als decimaalteken en geen duizendtalscheidingsteken in de getallen. Onbekend veld: 0 of "".`;
    } else if (mode === 'factuur') {
      prompt =
`Je krijgt een inkoopfactuur. Haal de gegevens eruit en antwoord ALLEEN met geldige JSON, zonder extra tekst, exact zo: ` +
`{"leverancier":"","factuurnummer":"","factuurdatum":"","bedragIncl":0,"btwBedrag":0,"btwPercentage":0,"omschrijving":""}. ` +
`leverancier = naam van het bedrijf dat de factuur stuurt; bedragIncl = totaalbedrag inclusief btw; btwBedrag = het btw-bedrag; btwPercentage = 21, 9 of 0; ` +
`factuurdatum in formaat dd-mm-jjjj; omschrijving = korte omschrijving van wat er gekocht is (maximaal 6 woorden). ` +
`Gebruik een punt als decimaalteken, geen duizendtalscheidingsteken. Onbekend veld: 0 of "".`;
    } else {
      prompt =
`Je bent een vriendelijke medewerker van het Nederlandse administratiekantoor Vatan Administratie. ` +
`Een klant die vaak weinig Nederlands begrijpt stuurt deze brief. Leg in het ${taal} heel eenvoudig en KORT uit wat dit is. ` +
`Schrijf maximaal 5 korte zinnen in gewone spreektaal. Vertel in die zinnen kort: van wie de brief is en waar hij over gaat, ` +
`of het van de Belastingdienst/belasting is of juist niet, of het urgent is (met bedrag of datum als die zichtbaar is), en wat de klant nu moet doen. ` +
`Gebruik GEEN opmaak: geen sterretjes, geen vetgedrukte tekst, geen kopjes, geen lijstjes, geen nummering, geen markdown — alleen gewone zinnen. ` +
`Geef geen volledige vertaling. Als de afbeelding onleesbaar is of je twijfelt, zeg dat eerlijk en adviseer de brief via Berichten naar Vatan te sturen. ` +
`Antwoord volledig in het ${taal}.`;
    }

    const parts = [{ text: prompt }];
    if (imageBase64) {
      parts.push({ inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } });
    } else if (text) {
      parts.push({ text: 'Tekst van de brief:\n' + text });
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'Geen document of tekst meegegeven.' }) };
    }

    const reqBody = JSON.stringify({ contents: [{ parts }] });
    const tries = [
      { model: 'gemini-2.5-flash', wait: 0 },
      { model: 'gemini-2.5-flash-lite', wait: 900 },
      { model: 'gemini-2.5-flash-lite', wait: 900 }
    ];
    let r, data;
    for (const tcfg of tries) {
      if (tcfg.wait) await new Promise(res => setTimeout(res, tcfg.wait));
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${tcfg.model}:generateContent?key=${KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody
      });
      data = await r.json();
      if (r.ok) break;
    }
    if (!r.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: (data && data.error && data.error.message) || 'De AI is nu erg druk. Probeer over een halve minuut opnieuw.' }) };
    }

    const answer =
      (data.candidates && data.candidates[0] && data.candidates[0].content &&
       data.candidates[0].content.parts || [])
        .map(p => p.text).filter(Boolean).join('') || '';

    if (mode === 'aanslag') {
      let kenmerk = '', bedrag = '';
      try {
        const m = answer.match(/\{[\s\S]*\}/);
        const obj = JSON.parse(m ? m[0] : answer);
        kenmerk = obj.kenmerk || '';
        bedrag = obj.bedrag || '';
      } catch (e) {}
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kenmerk, bedrag }) };
    }

    if (mode === 'lease') {
      let o = {};
      try { const m = answer.match(/\{[\s\S]*\}/); o = JSON.parse(m ? m[0] : answer); } catch (e) {}
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kenteken: o.kenteken || '', maandbedrag: o.maandbedrag || 0, looptijd: o.looptijd || 0, renteTotaal: o.renteTotaal || 0, hoofdsom: o.hoofdsom || 0, slottermijn: o.slottermijn || 0, startjaar: o.startjaar || 0, startmaanden: o.startmaanden || 0 }) };
    }
    if (mode === 'factuur') {
      let o = {};
      try { const m = answer.match(/\{[\s\S]*\}/); o = JSON.parse(m ? m[0] : answer); } catch (e) {}
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leverancier: o.leverancier || '', factuurnummer: o.factuurnummer || '', factuurdatum: o.factuurdatum || '', bedragIncl: o.bedragIncl || 0, btwBedrag: o.btwBedrag || 0, btwPercentage: o.btwPercentage || 0, omschrijving: o.omschrijving || '' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: answer || 'Geen antwoord ontvangen.' })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
