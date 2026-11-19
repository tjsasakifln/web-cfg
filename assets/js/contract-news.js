/* News-to-service clicks use the existing consent, PII and collector contract. */
(() => {
  const family = 'noticias-contratos-publicos';
  const destination = '/acompanhamento-contratos-obras/';
  const destinationService = 'acompanhamento-contratos-obras';
  const sourcePattern = /^\/noticias\/contratos-publicos\/(?:pagina\/[1-9][0-9]*\/|[a-z][a-z-]{0,90}[a-f0-9]{16}\/)?$/;

  const init = () => {
    const body = document.body;
    if (!body || body.getAttribute('data-route-family') !== family) return;
    const sourcePath = window.location.pathname;
    const assetId = body.getAttribute('data-asset-id') || '';
    if (!sourcePattern.test(sourcePath) || !/^(?:contract-news-hub|news-[a-f0-9]{16})$/.test(assetId)) return;
    document.querySelectorAll('a[data-news-service-link="true"][data-cta-id="news-contract-support"]').forEach(link => {
      if (link.getAttribute('href') !== destination) return;
      link.addEventListener('click', event => {
        if (event.__confengeTracked || link.getAttribute('href') !== destination || typeof window.confengeTrack !== 'function') return;
        // This existing marker prevents the shared click listeners from
        // emitting a second event. The anchor's normal navigation is untouched.
        event.__confengeTracked = true;
        window.confengeTrack('content_to_service', {
          page_path: sourcePath,
          source_path: sourcePath,
          source_asset_id: assetId,
          source_asset_family: 'editorial',
          asset_id: assetId,
          asset_family: 'editorial',
          route_family: family,
          content_cluster: family,
          source_page_type: family,
          destination_path: destination,
          destination_service_id: destinationService,
          destination_type: 'service',
          cta_id: 'news-contract-support',
          cta_position: 'article_end',
        });
      }, true);
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
