(function () {
  try {
    var saved = localStorage.getItem('nasab_theme');
    var dark =
      saved === 'dark' ||
      (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    if (dark) root.classList.add('dark');
    else root.classList.remove('dark');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0b1312' : '#0f2d29');

    var rawFont = localStorage.getItem('pohon_font_family') || '';
    var cleanedFont = rawFont.replace(/\s+/g, ' ').trim();
    var fontName = /^[A-Za-z][A-Za-z0-9 ]{1,49}$/.test(cleanedFont)
      ? cleanedFont
      : 'Barlow Semi Condensed';
    var lower = fontName.toLowerCase();
    var sansStack = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    var serifStack = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
    var isSystem = lower === 'system';
    var isSerif = lower === 'lora' || lower === 'merriweather';

    root.dataset.fontFamily = isSystem ? 'System' : fontName;
    if (isSystem) {
      root.style.setProperty('--font-sans', sansStack);
    } else {
      root.style.setProperty('--font-sans', "'" + fontName + "', " + (isSerif ? serifStack : sansStack));
      var weights = lower === 'merriweather' ? '400;700' : '400;500;600;700';
      var encoded = encodeURIComponent(fontName).replace(/%20/g, '+');
      var link = document.getElementById('app-font-stylesheet');
      if (!link) {
        link = document.createElement('link');
        link.id = 'app-font-stylesheet';
        link.rel = 'stylesheet';
        link.onerror = function () {
          if (link.dataset.fallbackTried === '1') return;
          link.dataset.fallbackTried = '1';
          link.setAttribute('href', 'https://fonts.googleapis.com/css2?family=' + encoded + '&display=swap');
        };
        document.head.appendChild(link);
      }
      link.setAttribute(
        'href',
        'https://fonts.googleapis.com/css2?family=' + encoded + ':wght@' + weights + '&display=swap'
      );
    }
  } catch (e) {}
})();
