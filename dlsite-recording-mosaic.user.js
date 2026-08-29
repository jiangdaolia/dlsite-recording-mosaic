// ==UserScript==
// @name         DLsite 录屏马赛克
// @namespace    https://github.com/local/dlsite-recording-mosaic
// @version      1.0.4
// @description  自动遮挡 DLsite 的作品图片、详情轮播图、作品名与标签，方便安全录屏。
// @author       Local
// @downloadURL  https://raw.githubusercontent.com/jiangdaolia/dlsite-recording-mosaic/main/dlsite-recording-mosaic.user.js
// @updateURL    https://raw.githubusercontent.com/jiangdaolia/dlsite-recording-mosaic/main/dlsite-recording-mosaic.user.js
// @match        https://dlsite.com/*
// @match        https://*.dlsite.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  'use strict';

  const DEFAULTS = Object.freeze({
    enabled: true,
    images: true,
    titles: true,
    tags: true,
    strength: 5
  });
  const STORAGE_PREFIX = 'dlsite-recording-mosaic.';
  const SCRIPT_VERSION = '1.0.4';

  const ROOT_CLASSES = Object.freeze({
    enabled: 'dlm-enabled',
    images: 'dlm-images',
    titles: 'dlm-titles',
    tags: 'dlm-tags'
  });

  GM_addStyle(`
    html.dlm-enabled.dlm-images .dlm-image {
      filter: blur(var(--dlm-image-blur, 25px)) saturate(0.42) brightness(0.62) !important;
      transform: translateZ(0);
      image-rendering: pixelated !important;
      user-select: none !important;
      -webkit-user-drag: none !important;
      transition: none !important;
    }

    html.dlm-enabled.dlm-images .dlm-background-image {
      filter: blur(var(--dlm-image-blur, 25px)) saturate(0.42) brightness(0.62) !important;
      transform: translateZ(0);
      transition: none !important;
    }

    html.dlm-enabled.dlm-titles .dlm-title,
    html.dlm-enabled.dlm-tags .dlm-tag {
      color: transparent !important;
      text-shadow: none !important;
      background-color: #626b74 !important;
      background-image:
        linear-gradient(45deg, rgba(255, 255, 255, 0.14) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(255, 255, 255, 0.14) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(0, 0, 0, 0.14) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(0, 0, 0, 0.14) 75%) !important;
      background-position: 0 0, 0 5px, 5px -5px, -5px 0 !important;
      background-size: 10px 10px !important;
      border-color: transparent !important;
      border-radius: 3px !important;
      filter: blur(var(--dlm-text-filter, 1.5px)) !important;
      user-select: none !important;
      transition: none !important;
    }

    html.dlm-enabled.dlm-titles .dlm-title svg,
    html.dlm-enabled.dlm-tags .dlm-tag svg {
      visibility: hidden !important;
    }

    html.dlm-enabled.dlm-titles input.dlm-title,
    html.dlm-enabled.dlm-titles textarea.dlm-title {
      -webkit-text-security: square !important;
    }

    #dlm-voice-debug-tools {
      position: fixed !important;
      right: 16px !important;
      bottom: 16px !important;
      z-index: 2147483647 !important;
      display: flex !important;
      gap: 8px !important;
      filter: none !important;
      opacity: 1 !important;
    }

    #dlm-voice-debug-tools button {
      padding: 9px 13px !important;
      border: 1px solid #fff !important;
      border-radius: 6px !important;
      background: #255f9e !important;
      color: #fff !important;
      font: 13px/1.2 sans-serif !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35) !important;
      cursor: pointer !important;
      filter: none !important;
      opacity: 1 !important;
    }

    @media print {
      html.dlm-enabled.dlm-images .dlm-image,
      html.dlm-enabled.dlm-images .dlm-background-image,
      html.dlm-enabled.dlm-titles .dlm-title,
      html.dlm-enabled.dlm-tags .dlm-tag {
        visibility: hidden !important;
      }
    }
  `);

  const PRODUCT_LINK = [
    'a[href*="/work/=/product_id/"]',
    'a[href*="/announce/=/product_id/"]'
  ].join(',');

  const IMAGE_SELECTORS = [
    '#work_left img',
    '#work_image img',
    '.work_img img',
    '.work-img img',
    '.work_image img',
    '.work-image img',
    '.work_thumb img',
    '.work-thumb img',
    '.product-image img',
    '.product_image img',
    '.search_result_img_box_inner img',
    '.work_slider img',
    '.product-slider img',
    '[class^="WorkImage"] img',
    '[class*=" WorkImage"] img',
    '[class^="ProductImage"] img',
    '[class*=" ProductImage"] img',
    'img[src*="/images2/work/"]',
    'img[src*="/work/"][src*="_img_"]',
    'img[data-src*="/images2/work/"]',
    'img[data-original*="/images2/work/"]'
  ];

  const TITLE_SELECTORS = [
    '#work_name',
    '[itemprop="name"].work_name',
    '[itemprop="name"].work-name',
    '.work_name',
    '.work-name',
    '.work_title',
    '.work-title',
    '.product_name',
    '.product-name',
    '.product_title',
    '.product-title',
    '[class^="WorkInfo_name"]',
    '[class*=" WorkInfo_name"]',
    '[class^="WorkList_workName"]',
    '[class*=" WorkList_workName"]',
    '[class^="workName"]',
    '[class*=" workName"]'
  ];

  const TAG_SELECTORS = [
    '.work_genre',
    '.work-genre',
    '.work_genre_list',
    '.work-genre-list',
    '.genre_list',
    '.genre-list',
    '.product-tags',
    '.work-tags',
    '[class^="WorkInfo_genre"]',
    '[class*=" WorkInfo_genre"]',
    '[class^="WorkInfo_tags"]',
    '[class*=" WorkInfo_tags"]'
  ];

  const TAG_LINK_HINT = /(?:genre|tag|work_category)(?:\[|%5B|=|\/)/i;
  const TAG_LABEL = /^(?:ジャンル(?:・属性)?|作品ジャンル|genre(?:s)?|类型|類型|分类|分類|标签|標籤)$/i;
  const VOICE_ACTOR_LABEL = /^(?:声優|声优|聲優|配音|voiceactors?|cv)$/i;
  const NON_TITLE_TEXT = /^(?:詳細|详情|詳情|more|view|作品詳細|作品详情|查看作品)$/i;

  let settings = loadSettings();
  let scanQueued = false;

  function loadSettings() {
    const loaded = {};
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
      loaded[key] = GM_getValue(`${STORAGE_PREFIX}${key}`, fallback);
    }
    loaded.strength = Math.max(1, Math.min(5, Number(loaded.strength) || DEFAULTS.strength));
    return loaded;
  }

  function saveSetting(key, value) {
    settings[key] = value;
    GM_setValue(`${STORAGE_PREFIX}${key}`, value);
    applySettings();
  }

  function addClass(element, className) {
    if (!(element instanceof Element)) return;

    const isTextMask = className === 'dlm-title' || className === 'dlm-tag';
    const overlapsVoiceActor =
      isTextMask &&
      (element.closest('.dlm-voice-actor') || element.querySelector('.dlm-voice-actor'));
    if (!overlapsVoiceActor && !element.classList.contains(className)) {
      element.classList.add(className);
    }
  }

  function queryWithin(root, selector) {
    const results = [];
    if (root instanceof Element && root.matches(selector)) results.push(root);
    if (root && typeof root.querySelectorAll === 'function') {
      results.push(...root.querySelectorAll(selector));
    }
    return results;
  }

  function markImages(root) {
    for (const selector of IMAGE_SELECTORS) {
      for (const image of queryWithin(root, selector)) addClass(image, 'dlm-image');
    }

    for (const link of queryWithin(root, PRODUCT_LINK)) {
      for (const image of link.querySelectorAll('img, picture')) addClass(image, 'dlm-image');
    }

    for (const element of queryWithin(root, '[style*="/work/"], [style*="_img_"]')) {
      const background = element.style.backgroundImage || '';
      if (/\/work\/|_img_/i.test(background)) addClass(element, 'dlm-background-image');
    }
  }

  function directText(element) {
    return Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function markProductLinkTitle(link) {
    const namedChild = link.querySelector([
      '.work_name', '.work-name', '.work_title', '.work-title',
      '.product-title', '[class*="workName"]', '[class*="WorkList_workName"]',
      'h1', 'h2', 'h3', 'h4', 'strong'
    ].join(','));

    if (namedChild) {
      addClass(namedChild, 'dlm-title');
      return;
    }

    const text = directText(link);
    if (text.length >= 3 && !NON_TITLE_TEXT.test(text)) addClass(link, 'dlm-title');
  }

  function isProductDetailPage() {
    return /\/(?:work|announce)\/=\/product_id\//.test(location.pathname);
  }

  function protectVoiceActorRows(root) {
    if (!isProductDetailPage()) return;

    for (const label of queryWithin(root, 'dt, th')) {
      const normalized = (label.textContent || '').replace(/[：:\s]/g, '');
      if (!VOICE_ACTOR_LABEL.test(normalized)) continue;

      const value = label.nextElementSibling;
      const hasExpectedValue =
        (label.tagName === 'DT' && value?.tagName === 'DD') ||
        (label.tagName === 'TH' && value?.tagName === 'TD');
      if (!hasExpectedValue) continue;

      const container = label.tagName === 'TH' ? label.parentElement : value;
      for (const element of [container, value]) {
        if (element instanceof Element) element.classList.add('dlm-voice-actor');
      }
    }
  }

  function clearVoiceActorMasks(root) {
    if (!isProductDetailPage()) return;

    for (const container of queryWithin(root, '.dlm-voice-actor')) {
      container.classList.remove('dlm-title', 'dlm-tag');
      for (const element of container.querySelectorAll('.dlm-title, .dlm-tag')) {
        element.classList.remove('dlm-title', 'dlm-tag');
      }

      for (
        let ancestor = container.parentElement;
        ancestor && ancestor !== document.documentElement;
        ancestor = ancestor.parentElement
      ) {
        ancestor.classList.remove('dlm-title', 'dlm-tag');
      }
    }
  }

  function describeElement(element) {
    if (!(element instanceof Element)) return null;
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      id: element.id,
      class: element.getAttribute('class') || '',
      text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      filter: style.filter,
      color: style.color,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      visibility: style.visibility,
      opacity: style.opacity
    };
  }

  function findVoiceActorLabels() {
    const selectors = [
      'th', 'dt', 'strong', 'label', 'span',
      '[class*="label"]', '[class*="Label"]',
      '[class*="heading"]', '[class*="Heading"]'
    ].join(',');

    return [...new Set(queryWithin(document, selectors))].filter((element) => {
      const normalized = (element.textContent || '').replace(/[：:\s]/g, '');
      return VOICE_ACTOR_LABEL.test(normalized);
    });
  }

  function diagnosticEntry(label) {
    const nearby =
      label.closest('tr, dd, li, [class*="voice"], [class*="Voice"], [class*="creator"]') ||
      label.parentElement;
    const ancestors = [];
    for (
      let element = label;
      element && ancestors.length < 10;
      element = element.parentElement
    ) {
      ancestors.push(describeElement(element));
    }

    const relatedMasks = [...document.querySelectorAll(
      '.dlm-title, .dlm-tag, .dlm-voice-actor'
    )]
      .filter((element) =>
        element === nearby || element.contains(nearby) || nearby?.contains(element)
      )
      .map(describeElement);

    return {
      label: describeElement(label),
      nearby: describeElement(nearby),
      nearbyHTML: (nearby?.outerHTML || '').slice(0, 12000),
      ancestors,
      relatedMasks
    };
  }

  function buildVoiceActorDiagnostic() {
    const labels = findVoiceActorLabels();
    return {
      scriptVersion: SCRIPT_VERSION,
      url: location.href,
      rootClass: document.documentElement?.className || '',
      voiceActorLabelsFound: labels.length,
      entries: labels.slice(0, 20).map(diagnosticEntry)
    };
  }

  function createVoiceActorDiagnosticFile() {
    const productId = location.pathname.match(/(?:RJ|BJ|VJ)\d+/i)?.[0] || 'product';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `dlsite-voice-diagnostic-${productId}-${timestamp}.json`;
    const contents = JSON.stringify(buildVoiceActorDiagnostic(), null, 2);
    return new File([contents], filename, { type: 'application/json' });
  }

  function saveVoiceActorDiagnostic() {
    const file = createVoiceActorDiagnosticFile();
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return file.name;
  }

  async function shareVoiceActorDiagnostic() {
    const file = createVoiceActorDiagnosticFile();

    try {
      const shareData = {
        title: 'DLsite 声优遮罩诊断',
        text: '请查看附件中的声优遮罩诊断信息。',
        files: [file]
      };
      if (typeof navigator.share === 'function' && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return true;
      }

      saveVoiceActorDiagnostic();
      window.alert('当前浏览器不支持直接分享 JSON，文件已保存。请在微信中发送该文件。');
      return false;
    } catch (error) {
      if (error?.name === 'AbortError') return false;
      saveVoiceActorDiagnostic();
      window.alert('分享失败，诊断 JSON 已改为保存到本地。');
      return false;
    }
  }

  function installVoiceActorDiagnosticButton() {
    if (!isProductDetailPage() || document.getElementById('dlm-voice-debug-tools')) return;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', installVoiceActorDiagnosticButton, { once: true });
      return;
    }

    const tools = document.createElement('div');
    tools.id = 'dlm-voice-debug-tools';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.textContent = '保存诊断 JSON';
    saveButton.addEventListener('click', () => {
      saveVoiceActorDiagnostic();
      saveButton.textContent = '已保存';
      window.setTimeout(() => {
        saveButton.textContent = '保存诊断 JSON';
      }, 3000);
    });

    const shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.textContent = '分享到微信';
    shareButton.addEventListener('click', shareVoiceActorDiagnostic);

    tools.append(saveButton, shareButton);
    document.body.appendChild(tools);
  }

  function markTitles(root) {
    for (const selector of TITLE_SELECTORS) {
      for (const element of queryWithin(root, selector)) addClass(element, 'dlm-title');
    }

    for (const link of queryWithin(root, PRODUCT_LINK)) markProductLinkTitle(link);

    if (isProductDetailPage()) {
      for (const heading of queryWithin(root, 'main h1, #main h1, [role="main"] h1')) {
        addClass(heading, 'dlm-title');
      }
    }
  }

  function markSemanticTagRows(root) {
    for (const label of queryWithin(root, 'dt, th')) {
      const normalized = (label.textContent || '').replace(/[：:\s]/g, '');
      if (!TAG_LABEL.test(normalized)) continue;

      if (label.tagName === 'DT') {
        const value = label.nextElementSibling;
        if (value && value.tagName === 'DD') addClass(value, 'dlm-tag');
      } else {
        const value = label.nextElementSibling;
        if (value && value.tagName === 'TD') addClass(value, 'dlm-tag');
      }
    }
  }

  function markTags(root) {
    for (const selector of TAG_SELECTORS) {
      for (const element of queryWithin(root, selector)) addClass(element, 'dlm-tag');
    }

    for (const link of queryWithin(root, 'a[href]')) {
      const href = link.getAttribute('href') || '';
      if (TAG_LINK_HINT.test(href)) addClass(link, 'dlm-tag');
    }

    markSemanticTagRows(root);
  }

  function scan(root = document) {
    protectVoiceActorRows(root);
    markImages(root);
    markTitles(root);
    markTags(root);
    clearVoiceActorMasks(root);
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    const run = () => {
      scanQueued = false;
      scan(document);
    };
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 250 });
    } else {
      window.setTimeout(run, 30);
    }
  }

  function applySettings() {
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle(ROOT_CLASSES.enabled, Boolean(settings.enabled));
    root.classList.toggle(ROOT_CLASSES.images, Boolean(settings.images));
    root.classList.toggle(ROOT_CLASSES.titles, Boolean(settings.titles));
    root.classList.toggle(ROOT_CLASSES.tags, Boolean(settings.tags));
    root.style.setProperty('--dlm-image-blur', `${10 + settings.strength * 3}px`);
    root.style.setProperty('--dlm-text-filter', `${0.5 + settings.strength * 0.2}px`);
  }

  function toggleSetting(key) {
    saveSetting(key, !settings[key]);
    console.info(`[DLsite 录屏马赛克] ${key}: ${settings[key] ? '开启' : '关闭'}`);
  }

  function registerMenu() {
    GM_registerMenuCommand('切换总开关', () => toggleSetting('enabled'));
    GM_registerMenuCommand('切换作品图片/轮播', () => toggleSetting('images'));
    GM_registerMenuCommand('切换作品名', () => toggleSetting('titles'));
    GM_registerMenuCommand('切换标签/类型', () => toggleSetting('tags'));
    GM_registerMenuCommand('保存声优诊断 JSON', saveVoiceActorDiagnostic);
    GM_registerMenuCommand('分享声优诊断', shareVoiceActorDiagnostic);
    GM_registerMenuCommand('切换遮挡强度（1 → 5）', () => {
      saveSetting('strength', settings.strength >= 5 ? 1 : settings.strength + 1);
      console.info(`[DLsite 录屏马赛克] 遮挡强度: ${settings.strength}/5`);
    });
  }

  function start() {
    applySettings();
    scan(document);
    installVoiceActorDiagnosticButton();

    const observer = new MutationObserver((mutations) => {
      if (mutations.length) queueScan();
    });
    observer.observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'data-src', 'data-original', 'href', 'style']
    });

    document.addEventListener('keydown', (event) => {
      if (event.altKey && event.shiftKey && event.code === 'KeyM') {
        event.preventDefault();
        toggleSetting('enabled');
      }
    });

    registerMenu();
  }

  if (document.documentElement) {
    start();
  } else {
    new MutationObserver((_mutations, observer) => {
      if (!document.documentElement) return;
      observer.disconnect();
      start();
    }).observe(document, { childList: true });
  }
})();
