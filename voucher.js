/* A private gift link uses a URL fragment (#gift=...), never a URL path.
   This keeps bearer tokens out of web-server request and access logs. */
(() => {
  'use strict';
  if (!location.hash.startsWith('#gift=')) return;
  const token = location.hash.slice('#gift='.length);
  const isToken = /^[a-f0-9]{48}$/.test(token);
  const nameNode = document.querySelector('#recipient-name');
  const dialog = document.querySelector('#gift-dialog .gift-dialog');
  const notice = dialog?.querySelector('.demo-notice');
  const cardBrand = dialog?.querySelector('.card-preview .brand');
  const back = dialog?.querySelector('.close-text');
  const shareButton = document.querySelector('#share-button');
  if (!nameNode || !dialog || !notice || !cardBrand || !back || !shareButton) return;

  nameNode.textContent = 'प्रिय अतिथि';
  document.title = 'आपका दीपावली उपहार | AAD TECH';
  cardBrand.textContent = 'AMAZON PAY GIFT CARD';
  notice.setAttribute('role', 'status');
  notice.textContent = 'उपहार की जानकारी लोड हो रही है…';

  const revealButton = document.createElement('button');
  revealButton.type = 'button';
  revealButton.className = 'button button-primary';
  revealButton.textContent = 'Reveal My Gift Code';
  revealButton.style.cssText = 'width:100%;margin:12px 0;justify-content:center;cursor:pointer';
  revealButton.hidden = true;

  const codeArea = document.createElement('div');
  codeArea.hidden = true;
  codeArea.style.cssText = 'margin:12px 0;padding:14px;border:1px solid #c38a42;border-radius:12px;background:#fff9e8;word-break:break-word;user-select:text';
  const codeLabel = document.createElement('p');
  codeLabel.textContent = 'Your Amazon Pay gift card code';
  const codeText = document.createElement('strong');
  codeText.style.cssText = 'display:block;font-size:20px;letter-spacing:.05em;color:#4e3019';
  codeArea.append(codeLabel, codeText);

  const redeem = document.createElement('a');
  redeem.textContent = 'Redeem on Amazon India';
  redeem.href = 'https://www.amazon.in/gc/redeem';
  redeem.rel = 'noopener noreferrer';
  redeem.target = '_blank';
  redeem.hidden = true;
  redeem.style.cssText = 'display:block;text-align:center;margin:10px 0;text-decoration:underline;color:#804016';
  back.before(revealButton, codeArea, redeem);

  let ready = false;
  async function giftRequest(endpoint) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      body: JSON.stringify({token})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Service unavailable');
    return payload;
  }

  async function lookup() {
    if (!isToken) {
      notice.textContent = 'यह उपहार लिंक वैध नहीं है।';
      return;
    }
    try {
      const gift = await giftRequest('/api/gift/lookup');
      const recipient = String(gift.name || 'प्रिय अतिथि').slice(0, 120);
      nameNode.textContent = recipient;
      document.title = 'शुभ दीपावली, ' + recipient + ' | AAD TECH';
      ready = gift.status === 'READY' || gift.status === 'REVEALED';
      if (gift.status === 'DISABLED') {
        notice.textContent = 'यह उपहार लिंक निष्क्रिय कर दिया गया है।';
      } else if (ready) {
        const value = Number(gift.denomination);
        const formatted = Number.isFinite(value) && value > 0
          ? new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', maximumFractionDigits:0}).format(value)
          : '';
        notice.textContent = 'आपके लिए एक विशेष उपहार तैयार है। ' + formatted;
        revealButton.hidden = false;
      } else {
        notice.textContent = 'आपका उपहार तैयार किया जा रहा है। कृपया बाद में देखें।';
      }
    } catch (error) {
      notice.textContent = error.message === 'Invalid gift link'
        ? 'यह उपहार लिंक वैध नहीं है।'
        : 'Gift service is not available yet. Please try again later.';
    }
  }

  revealButton.addEventListener('click', async () => {
    if (!ready) return;
    revealButton.disabled = true;
    revealButton.textContent = 'Opening your gift…';
    try {
      const gift = await giftRequest('/api/gift/reveal');
      codeText.textContent = gift.voucher_code;
      codeArea.hidden = false;
      redeem.hidden = false;
      notice.textContent = 'यह आपका व्यक्तिगत गिफ्ट कार्ड कोड है। इसे सुरक्षित रखें।';
      revealButton.hidden = true;
    } catch (error) {
      notice.textContent = 'Gift could not be revealed: ' + error.message;
      revealButton.disabled = false;
      revealButton.textContent = 'Try Again';
    }
  });

  // Sharing wishes must not share this private gift link.
  shareButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const publicUrl = location.origin + '/';
    const data = {title: 'शुभ दीपावली | AAD TECH', text: 'दीपावली की हार्दिक शुभकामनाएं! 🪔', url: publicUrl};
    try {
      if (navigator.share) await navigator.share(data);
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(publicUrl);
      else window.prompt('Share public greeting', publicUrl);
    } catch (error) {
      if (error.name !== 'AbortError') window.prompt('Share public greeting', publicUrl);
    }
  }, true);

  lookup();
})();
