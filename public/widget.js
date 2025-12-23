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
    .reviews-list {
      max-height: 400px;
      overflow-y: auto;
    }
    .review-item {
      padding: 16px;
      border-bottom: 1px solid #eee;
    }
    .review-item:last-child {
      border-bottom: none;
    }
    .review-content {
      font-size: 14px;
      color: #333;
      line-height: 1.5;
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
    .review-author-container {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .review-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      opacity: 0;
      transition: opacity 0.3s ease-in;
    }
    .review-avatar.loaded {
      opacity: 1;
    }
    .avatar-placeholder {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: #ffc0cb; /* Pink background */
      color: #333;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 18px;
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
    if (!data.reviews || data.reviews.length === 0) {
      renderError();
      return;
    }

    // Sort by time descending (Newest first)
    const sortedReviews = data.reviews.sort((a, b) => b.time - a.time);

    const starSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
    
    // Global rating stars
    const starsHtml = Array(5).fill(0).map((_, i) => 
      `<span style="opacity: ${i < Math.round(data.rating) ? 1 : 0.3}">${starSvg}</span>`
    ).join('');

    // Generate HTML for ALL reviews
    const reviewsHtml = sortedReviews.map(review => {
        const reviewStarsHtml = Array(5).fill(0).map((_, i) => 
          `<span style="opacity: ${i < review.rating ? 1 : 0.3}">${starSvg}</span>`
        ).join('');

        // Avatar Logic
        let avatarSrc = null;
        if (review.photos && Array.isArray(review.photos) && review.photos.length > 0 && typeof review.photos[0] === 'string') {
            const cleanUrl = review.photos[0].trim();
            if (cleanUrl.length > 0) avatarSrc = cleanUrl;
        }
        if (!avatarSrc && review.profile_photo_url && typeof review.profile_photo_url === 'string') {
            const cleanProfileUrl = review.profile_photo_url.trim();
            if (cleanProfileUrl.length > 0) avatarSrc = cleanProfileUrl;
        }

        let avatarHtml = '';
        const initial = review.author_name ? review.author_name.charAt(0).toUpperCase() : '?';
        const placeholderHtml = `<div class="avatar-placeholder" style="display: ${avatarSrc ? 'none' : 'flex'}">${initial}</div>`;

        if (avatarSrc) {
          avatarHtml = `<img src="${avatarSrc}" class="review-avatar" alt="${review.author_name}" onload="this.classList.add('loaded')" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">` + placeholderHtml;
        } else {
          avatarHtml = placeholderHtml;
        }

        return `
          <div class="review-item">
            <div class="review-author-container">
                ${avatarHtml}
                <span class="review-author-name">${review.author_name}</span>
            </div>
            <div class="stars" style="display:flex; gap:1px; margin-bottom: 8px;">${reviewStarsHtml}</div>
            <div class="review-content">
                "${review.text.length > 120 ? review.text.substring(0, 120) + '...' : review.text}"
            </div>
          </div>
        `;
    }).join('');

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
        <div class="reviews-list">
            ${reviewsHtml}
        </div>
      </div>
    `;
  }
})();
