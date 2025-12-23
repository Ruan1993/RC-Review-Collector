(function() {
  // Determine API URL based on script source
  const script = document.currentScript || document.querySelector('script[src*="widget.js"]');
  const scriptUrl = new URL(script.src);
  const widgetId = scriptUrl.searchParams.get('id');
  const API_URL = `${scriptUrl.origin}/api/widget${widgetId ? `?id=${widgetId}` : ''}`;

  // Create container
  const container = document.createElement('div');
  container.id = 'rc-google-reviews-widget';
  document.body.appendChild(container);

  // Attach Shadow DOM
  const shadow = container.attachShadow({ mode: 'open' });

  // Styles
  const styles = `
    :host {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .widget-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      width: 300px;
      overflow: hidden;
      transition: transform 0.3s ease;
      animation: slideIn 0.5s ease-out;
    }
    .widget-container:hover {
      transform: translateY(-5px);
    }
    .header {
      padding: 16px;
      background: #f8f9fa;
      border-bottom: 1px solid #eee;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .rating-badge {
      background: #fab005;
      color: white;
      font-weight: bold;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 14px;
    }
    .total-reviews {
      color: #666;
      font-size: 12px;
    }
    .review-content {
      padding: 16px;
      font-size: 14px;
      color: #333;
      line-height: 1.5;
      max-height: 150px;
      overflow-y: auto;
    }
    .review-author {
      font-weight: 600;
      margin-bottom: 4px;
      display: block;
    }
    .stars {
      color: #fab005;
      margin-bottom: 8px;
    }
    .google-logo {
      width: 20px;
      height: 20px;
      margin-left: auto;
    }
    @keyframes slideIn {
      from { transform: translateY(100px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .loading {
      padding: 20px;
      text-align: center;
      color: #666;
    }
    .error {
      padding: 10px;
      color: red;
      font-size: 12px;
      text-align: center;
    }
  `;

  // Fetch Data
  fetch(API_URL)
    .then(response => {
      if (!response.ok) throw new Error('Failed to load reviews');
      return response.json();
    })
    .then(data => {
      renderWidget(data);
    })
    .catch(err => {
      console.error('Widget Error:', err);
      renderError();
    });

  function renderError() {
    shadow.innerHTML = `
      <style>${styles}</style>
      <div class="widget-container">
        <div class="error">Unable to load reviews</div>
      </div>
    `;
  }

  function renderWidget(data) {
    // Find the best review (highest rating + text length > 10) or just the first one
    const topReview = data.reviews.find(r => r.rating >= 4 && r.text.length > 20) || data.reviews[0];
    
    if (!topReview) {
      renderError();
      return;
    }

    const starSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
    const starsHtml = Array(5).fill(0).map((_, i) => 
      `<span style="opacity: ${i < Math.round(data.rating) ? 1 : 0.3}">${starSvg}</span>`
    ).join('');

    const reviewStarsHtml = Array(5).fill(0).map((_, i) => 
      `<span style="opacity: ${i < topReview.rating ? 1 : 0.3}">${starSvg}</span>`
    ).join('');

    // Avatar Logic
    let avatarHtml = '';
    if (topReview.profile_photo_url) {
      avatarHtml = `<img src="${topReview.profile_photo_url}" class="review-avatar" alt="${topReview.author_name}" onload="this.classList.add('loaded')">`;
    } else {
      const initial = topReview.author_name ? topReview.author_name.charAt(0).toUpperCase() : '?';
      avatarHtml = `<div class="avatar-placeholder">${initial}</div>`;
    }

    shadow.innerHTML = `
      <style>${styles}</style>
      <div class="widget-container">
        <div class="header">
          <div class="rating-badge">${data.rating} ★</div>
          <div>
            <div class="stars" style="display:flex; gap:2px; margin:0;">${starsHtml}</div>
            <div class="total-reviews">${data.user_ratings_total} Google Reviews</div>
          </div>
        </div>
        <div class="review-content">
          <div class="review-author-container">
            ${avatarHtml}
            <span class="review-author-name">${topReview.author_name}</span>
          </div>
          <div class="stars" style="display:flex; gap:1px; margin-bottom: 8px;">${reviewStarsHtml}</div>
          "${topReview.text.length > 120 ? topReview.text.substring(0, 120) + '...' : topReview.text}"
        </div>
      </div>
    `;
  }
})();
