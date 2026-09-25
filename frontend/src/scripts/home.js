(() => {
  "use strict";

  const state = {
    products: loadProducts(),
    filter: "All",
    query: "",
    sort: "featured",
    lastFocused: null,
    paymentOrderNumber: null,
    paymentCart: null,
    checkoutIdempotencyKey: null
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  async function checkPrivateAdminCode(value){
  const code=String(value||"").trim();
  const target=document.getElementById("privateAdminAccess");
  if(!target)return;
  target.hidden=true;
  if(!code||code.length<6)return;
  try{
    const response=await DripAPI.fetch("/api/admin/discover",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({code})});
    if(response.ok){
      const data=await response.json().catch(()=>({}));
      if(data.unlocked){target.hidden=false;bindPageTransitions();showToast("Private admin access unlocked.");}
    }
  }catch{}
}

document.addEventListener("DOMContentLoaded", init);

  function init() {
    applyTheme();
    bindTheme();
    bindNavigation();
    bindSearch();
    bindShop();
    bindCart();
    bindPaymentModal();
    bindProductModal();
    bindNewsletter();
    bindPageTransitions();
    bindModalFocusTrap();
    hardenExternalLinks();
    initMicroInteractions();
    initCarousel();
    initJournalReveal();
    renderProductSkeletons();
    syncProductsFromAPI().finally(() => {
      window.requestAnimationFrame(() => window.setTimeout(renderProducts, 180));
    });
    updateCartCount();
    updateYear();
    if (new URLSearchParams(window.location.search).get("checkout") === "1") {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      window.setTimeout(() => openCheckout(), 100);
    }

    window.addEventListener("cartUpdated", () => {
      state.products = loadProducts();
      updateCartCount();
      renderProducts();
      if ($("cartModal")?.classList.contains("open")) renderCart();
    });

    window.addEventListener("storage", (event) => {
      if (event.key === DRIP_STORAGE.products) {
        state.products = loadProducts();
        renderProducts();
      }
      if (event.key === DRIP_STORAGE.cart) updateCartCount();
      if (event.key === DRIP_STORAGE.theme) applyTheme();
      if (event.key === DRIP_STORAGE.wishlist) renderProducts();
      if (event.key === DRIP_STORAGE.orders) {
        const order = loadOrders().find(item => item.id === state.paymentOrderNumber);
        if (order?.status === "Approved" || order?.status === "Successful" || order?.status === "Processing") showPaymentConfirmed();
        if (order?.status === "Rejected") showPaymentRejected();
      }
    });
  }

  async function syncProductsFromAPI() {
    try {
      const response = await DripAPI.fetch("/api/products", { credentials: "include" });
      if (!response.ok) return;
      const remote = await response.json();
      if (!Array.isArray(remote) || !remote.length) return;
      state.products = remote.map(product => normalizeProduct({
        ...product,
        image: normalizeAssetPath(product.image || ""),
        stock: Number(product.stock),
        sizes: Array.isArray(product.sizes) ? product.sizes : [],
        colours: Array.isArray(product.colours) ? product.colours : [],
        gallery: Array.isArray(product.gallery) && product.gallery.length
          ? product.gallery.map(normalizeAssetPath)
          : undefined
      }));
      // Never let an older database value overwrite the locked storefront prices.
      localStorage.setItem(DRIP_STORAGE.products, JSON.stringify(state.products));
      localStorage.setItem(DRIP_STORAGE.catalogVersion, "12");
      } catch {
      // The storefront still works locally when the API is unavailable.
    }
  }

  function renderProductSkeletons() {
    const grid = $("products");
    if (!grid || grid.children.length) return;
    grid.setAttribute("aria-busy", "true");
    grid.innerHTML = Array.from({ length: 6 }, () => `
      <article class="product skeleton-product" aria-hidden="true">
        <div class="skeleton skeleton-image"></div>
        <div class="product-info">
          <div class="skeleton skeleton-line wide"></div>
          <div class="skeleton skeleton-line"></div>
          <div class="skeleton skeleton-line short"></div>
        </div>
      </article>`).join("");
  }

  function hardenExternalLinks() {
    $$('a[target="_blank"]').forEach((link) => {
      const rel = new Set((link.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
      rel.add("noopener");
      rel.add("noreferrer");
      link.setAttribute("rel", [...rel].join(" "));
    });
  }

  function initMicroInteractions() {
    document.addEventListener("pointerdown", (event) => {
      const target = event.target.closest("button, .btn, .product-image, .category-card, .cart");
      if (!target || target.disabled || target.closest(".modal-close")) return;
      target.classList.remove("micro-press");
      void target.offsetWidth;
      target.classList.add("micro-press");
      window.setTimeout(() => target.classList.remove("micro-press"), 260);
    }, { passive: true });
  }

  function updateYear() {
    const year = $("year");
    if (year) year.textContent = new Date().getFullYear();
  }

  function applyTheme() {
    const theme = loadTheme();
    document.documentElement.dataset.theme = theme;
    const button = $("themeBtn");
    if (button) {
      button.textContent = theme === "dark" ? "☀" : "☾";
      button.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
  }

  function bindTheme() {
    $("themeBtn")?.addEventListener("click", () => {
      saveTheme(loadTheme() === "dark" ? "light" : "dark");
      applyTheme();
    });
  }

  function bindNavigation() {
    const menuButton = $("menuBtn");
    const menu = $("mobileMenu");
    if (menuButton && menu) {
      menuButton.addEventListener("click", () => {
        const open = menu.classList.toggle("open");
        menu.setAttribute("aria-hidden", String(!open));
        menuButton.setAttribute("aria-expanded", String(open));
      });

      $$("a", menu).forEach((link) => link.addEventListener("click", () => closeMobileMenu()));
    }

    document.addEventListener("click", (event) => {
      if (!menu || !menu.classList.contains("open")) return;
      if (!menu.contains(event.target) && !menuButton?.contains(event.target)) closeMobileMenu();
    });
  }

  function closeMobileMenu() {
    const menu = $("mobileMenu");
    const button = $("menuBtn");
    if (!menu) return;
    menu.classList.remove("open");
    menu.setAttribute("aria-hidden", "true");
    button?.setAttribute("aria-expanded", "false");
  }

  function bindPageTransitions() {
    const overlay = $("transitionOverlay");
    if (!overlay) return;
    $$("[data-transition]").forEach((link) => {
      link.addEventListener("click", (event) => {
        const href = link.getAttribute("href");
        if (!href || href.startsWith("#") || link.target === "_blank") return;
        event.preventDefault();
        overlay.classList.add("show");
        window.setTimeout(() => { window.location.href = href; }, 260);
      });
    });
    window.setTimeout(() => overlay.classList.remove("show"), 250);
  }

  function syncBodyScrollLock() {
    const anyOpen = $$(".product-modal.open, .cart-modal.open, .payment-modal.open").length > 0;
    document.body.classList.toggle("modal-open", anyOpen);
  }

  function bindModalFocusTrap() {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const paymentModal = $("paymentModal");
        const checkoutModal = $("checkoutModal");
        const cartModal = $("cartModal");
        const productModal = $("productModal");

        if (paymentModal?.classList.contains("open")) return closePayment();
        if (checkoutModal?.classList.contains("open")) return closeCheckout();
        if (cartModal?.classList.contains("open")) return closeCart();
        if (productModal?.classList.contains("open")) return closeProduct();
        return;
      }

      if (event.key !== "Tab") return;
      const openModal = document.querySelector(".product-modal.open, .cart-modal.open, .payment-modal.open");
      if (!openModal) return;
      const focusable = [...openModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function bindSearch() {
    const panel = $("searchPanel");
    const input = $("searchInput");
    $("searchBtn")?.addEventListener("click", () => {
      if (!panel || !input) return;
      const open = panel.classList.toggle("open");
      if (open) input.focus();
      else input.blur();
    });
    $("closeSearch")?.addEventListener("click", closeSearch);
    let privateCodeTimer;
    input?.addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      renderProducts();
      renderSearchResults();
      clearTimeout(privateCodeTimer);
      privateCodeTimer = window.setTimeout(() => checkPrivateAdminCode(event.target.value), 350);
    });
  }

  function renderSearchResults() {
    const results = $("searchResults");
    if (!results) return;
    if (!state.query) {
      results.innerHTML = "";
      return;
    }

    const matches = state.products.filter((product) => {
      const searchable = `${product.name} ${product.category} ${product.description || ""}`.toLowerCase();
      return searchable.includes(state.query);
    }).slice(0, 5);

    results.innerHTML = matches.length
      ? matches.map((product) => `
        <button class="search-result" type="button" data-search-product="${escapeHTML(product.id)}">
          <span class="search-result-thumb">${productVisual(product)}</span>
          <span class="search-result-copy"><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.category)} · ${money(product.price)}</small></span>
        </button>
      `).join("")
      : `<p class="search-empty">No products found for “${escapeHTML(state.query)}”.</p>`;

    results.querySelectorAll("[data-search-product]").forEach((button) => {
      button.addEventListener("click", () => {
        openProduct(button.dataset.searchProduct);
        closeSearch();
      });
    });
  }

  function closeSearch() {
    $("searchPanel")?.classList.remove("open");
  }

  function bindShop() {
    $$(".filter").forEach((button) => button.addEventListener("click", () => {
      $$(".filter").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter || "All";
      renderProducts();
    }));

    $$(".category-card").forEach((button) => button.addEventListener("click", () => {
      state.filter = button.dataset.category || "All";
      $$(".filter").forEach((item) => item.classList.toggle("active", item.dataset.filter === state.filter));
      $("shop")?.scrollIntoView({ behavior: "smooth", block: "start" });
      renderProducts();
    }));

    $("sortProducts")?.addEventListener("change", (event) => {
      state.sort = event.target.value;
      renderProducts();
    });
  }

  function getFilteredProducts() {
    let list = state.products.filter((product) => {
      const matchesCategory = state.filter === "All" || product.category === state.filter;
      const searchable = `${product.name} ${product.category} ${product.description || ""}`.toLowerCase();
      return matchesCategory && (!state.query || searchable.includes(state.query));
    });

    if (state.sort === "price-low") list.sort((a, b) => a.price - b.price);
    if (state.sort === "price-high") list.sort((a, b) => b.price - a.price);
    if (state.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }

  function getAvailableSizes(product) {
    if (Array.isArray(product.sizes) && product.sizes.length) return product.sizes;
    return product.category === "Tote Bags" || product.category === "Caps" ? ["One Size"] : ["XS", "S", "M", "L", "XL", "XXL"];
  }

  function getProductImages(product) {
    const gallery = Array.isArray(product.gallery) && product.gallery.length
      ? product.gallery
      : (Array.isArray(productAssetFallbacks(product)) && productAssetFallbacks(product).length
        ? productAssetFallbacks(product)
        : [product.image]);

    const normalized = gallery.filter(Boolean).map(normalizeAssetPath);
    if (normalized.length < 2) return normalized;

    const front = normalized.find((src) => /front(?:[._-]|$)/i.test(src)) || normalized[0];
    const back = normalized.find((src) => /back(?:[._-]|$)/i.test(src) && src !== front) || normalized.find((src) => src !== front);
    return [front, back].filter(Boolean);
  }

  function renderProducts() {
    const grid = $("products");
    if (!grid) return;
    const products = getFilteredProducts();
    const wishlist = loadWishlist();

    grid.innerHTML = products.length
      ? products.map((product) => `
        <article class="product" data-product-id="${escapeHTML(product.id)}">
          <button class="product-image" type="button" data-product-action="view" data-product-id="${escapeHTML(product.id)}" aria-label="View ${escapeHTML(product.name)}">
            ${product.stock < 1 ? `<span class="stock-badge out">Sold out</span>` : product.stock < 5 ? `<span class="stock-badge low">Only ${product.stock} left</span>` : ""}
            ${productCardVisual(product)}
          </button>
          <div class="product-info">
            <div class="product-title-row"><h3>${escapeHTML(product.name)}</h3><button class="wishlist-toggle${wishlist.includes(product.id) ? " active" : ""}" type="button" data-product-action="wishlist" data-product-id="${escapeHTML(product.id)}" aria-label="${wishlist.includes(product.id) ? "Remove" : "Add"} ${escapeHTML(product.name)} ${wishlist.includes(product.id) ? "from" : "to"} wishlist">${wishlist.includes(product.id) ? "♥" : "♡"}</button></div>
            <p>${escapeHTML(product.category)} · DripCartel</p>
            <div class="price">
              <span>${money(product.price)}</span>
              <button class="add" type="button" data-product-action="add" data-product-id="${escapeHTML(product.id)}" aria-label="Add ${escapeHTML(product.name)} to cart">${product.stock > 0 ? "+" : "—"}</button>
            </div>
          </div>
        </article>
      `).join("")
      : `<div class="empty-state"><img src="assets/dripcartel-icon.webp" alt=""><h3>No products found</h3><p>Try another search or category.</p></div>`;

    grid.setAttribute("aria-busy", "false");
    grid.querySelectorAll(".product-image").forEach((button) => {
      const image = button.querySelector(".product-card-img");
      const back = image?.dataset.backSrc ? normalizeAssetPath(image.dataset.backSrc) : "";
      if (!image || !back) return;

      const front = image.getAttribute("src");
      let preloaded = false;
      let showingBack = false;
      const preloadBack = () => {
        if (preloaded) return;
        const preload = new Image();
        preload.decoding = "async";
        preload.onload = () => { preloaded = true; };
        preload.src = back;
      };
      const showBack = () => {
        preloadBack();
        image.onerror = () => {
          image.onerror = null;
          image.src = front;
          showingBack = false;
        };
        image.src = back;
        image.alt = `${button.getAttribute("aria-label") || "Product"} back view`;
        button.querySelector("[data-view-label]")?.replaceChildren(document.createTextNode("BACK VIEW"));
        showingBack = true;
      };
      const showFront = () => {
        image.onerror = () => {
          image.onerror = null;
          image.src = "assets/dripcartel-icon.webp";
        };
        image.src = front;
        image.alt = `${button.getAttribute("aria-label") || "Product"} front view`;
        button.querySelector("[data-view-label]")?.replaceChildren(document.createTextNode("FRONT VIEW"));
        showingBack = false;
      };

      // Desktop keeps the original hover behaviour. Touch devices do not have hover,
      // so their first tap switches views and the next tap opens the product details.
      button.addEventListener("mouseenter", showBack);
      button.addEventListener("mouseleave", showFront);
      button.addEventListener("focus", showBack);
      button.addEventListener("blur", showFront);
      button.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" && !showingBack) { event.preventDefault(); showBack(); }
        if (event.key === "ArrowLeft" && showingBack) { event.preventDefault(); showFront(); }
      });

      button.addEventListener("click", (event) => {
        if (!back || !window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
        if (!button.dataset.mobileViewedBack) {
          event.preventDefault();
          event.stopImmediatePropagation();
          showBack();
          button.dataset.mobileViewedBack = "1";
          button.setAttribute("aria-label", `View ${button.dataset.productId} back view. Tap again for details.`);
        } else {
          button.dataset.mobileViewedBack = "";
          showFront();
        }
      });
    });

    grid.querySelectorAll("[data-product-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.productId;
        if (button.dataset.productAction === "view") openProduct(id);
        if (button.dataset.productAction === "add") openProduct(id);
        if (button.dataset.productAction === "wishlist") {
          const added = toggleWishlist(id);
          renderProducts();
          showToast(added ? "Added to your wishlist." : "Removed from your wishlist.");
        }
      });
    });
  }

  function productCardVisual(product) {
    const images = getProductImages(product);
    const front = images[0] || "assets/dripcartel-icon.webp";
    const back = images[1] || "";
    const alt = escapeHTML(product.name);
    const backAttr = back ? ` data-back-src="${escapeHTML(back)}"` : "";
    const fallbacks = productAssetFallbacks(product);
    const fallbackFront = fallbacks[0] || "assets/dripcartel-icon.webp";
    const viewHint = back ? `<span class="product-view-label" data-view-label>FRONT VIEW</span>` : `<span class="product-view-label">FRONT VIEW</span>`;
    return `<span class="product-image-view" aria-label="${alt} front view${back ? "; hover for back view" : ""}">${viewHint}<img class="product-card-img" src="${escapeHTML(front)}" alt="${alt} front view" loading="eager" decoding="async"${backAttr} data-fallback-src="${escapeHTML(fallbackFront)}" onerror="if(this.dataset.fallbackUsed){this.onerror=null;this.src='assets/dripcartel-icon.webp';}else{this.dataset.fallbackUsed='1';this.src=this.dataset.fallbackSrc||'assets/dripcartel-icon.webp';}"></span>`;
  }


  function bindProductModal() {
    $("closeProduct")?.addEventListener("click", closeProduct);
    $("productModal")?.addEventListener("click", (event) => {
      if (event.target.id === "productModal") closeProduct();
    });
  }

  function openProduct(id) {
    const product = state.products.find((item) => item.id === id);
    const modal = $("productModal");
    const detail = $("productDetail");
    if (!product || !modal || !detail) return;

    state.lastFocused = document.activeElement;
    const images = getProductImages(product);
    detail.innerHTML = `
      <div class="product-detail">
        <div class="detail-image detail-gallery">
          <span class="detail-view-label" id="detailViewLabel">FRONT VIEW</span>
          <img id="detailMainImage" src="${escapeHTML(normalizeAssetPath(images[0] || productAssetFallbacks(product)[0] || 'assets/dripcartel-icon.webp'))}" alt="${escapeHTML(product.name)} front view" decoding="async" data-fallback-src="${escapeHTML(productAssetFallbacks(product)[0] || 'assets/dripcartel-icon.webp')}" onerror="if(this.dataset.fallbackUsed){this.onerror=null;this.src='assets/dripcartel-icon.webp';}else{this.dataset.fallbackUsed='1';this.src=this.dataset.fallbackSrc||'assets/dripcartel-icon.webp';}">
          ${images.length > 1 ? `<div class="gallery-controls" aria-label="Product views">${images.map((image, index) => `<button type="button" class="gallery-view${index === 0 ? " active" : ""}" data-gallery-index="${index}">${index === 0 ? "Front view" : "Back view"}</button>`).join("")}</div>` : ""}
        </div>
        <div class="detail-copy">
          <p class="kicker">${escapeHTML(product.category)}</p>
          <h2 id="productModalTitle">${escapeHTML(product.name)}</h2>
          <div class="detail-price">${money(product.price)}</div>
          <p>${escapeHTML(product.description || "Premium DripCartel piece.")}</p>
          <div class="stock-line">${product.stock > 0 ? `● ${product.stock} in stock` : "● Sold out"}</div>
          <label class="size-selector" for="productSize">Choose size<select id="productSize" ${product.stock < 1 ? "disabled" : ""}>${getAvailableSizes(product).map((size) => `<option value="${escapeHTML(size)}">${escapeHTML(size)}</option>`).join("")}</select></label>
          <button class="btn primary full" type="button" id="modalAddToCart" ${product.stock < 1 ? "disabled" : ""}>${product.stock > 0 ? "Add to cart" : "Sold out"}</button>
        </div>
      </div>`;

    detail.querySelectorAll("[data-gallery-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.galleryIndex);
        const image = $("detailMainImage");
        if (!image || !images[index]) return;
        image.src = normalizeAssetPath(images[index]);
        image.alt = `${product.name} ${index === 0 ? "front" : "back"} view`;
        const viewLabel = $("detailViewLabel");
        if (viewLabel) viewLabel.textContent = index === 0 ? "FRONT VIEW" : "BACK VIEW";
        detail.querySelectorAll(".gallery-view").forEach((view) => view.classList.toggle("active", view === button));
      });
    });

    const detailImage = $("detailMainImage");
    if (detailImage && images.length > 1) {
      let touchStartX = 0;
      let touchStartY = 0;
      detailImage.addEventListener("touchstart", (event) => {
        const touch = event.changedTouches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
      }, { passive: true });
      detailImage.addEventListener("touchend", (event) => {
        const touch = event.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
        const current = detail.querySelector(".gallery-view.active");
        const currentIndex = current ? Number(current.dataset.galleryIndex) : 0;
        const nextIndex = dx < 0 ? Math.min(currentIndex + 1, images.length - 1) : Math.max(currentIndex - 1, 0);
        detail.querySelector(`.gallery-view[data-gallery-index="${nextIndex}"]`)?.click();
      }, { passive: true });
    }

    $("modalAddToCart")?.addEventListener("click", () => {
      const size = $("productSize")?.value;
      if (size) {
        addToCart(product.id, size);
        closeProduct();
      }
    });

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    syncBodyScrollLock();
    $("closeProduct")?.focus();
  }

  function closeProduct() {
    const modal = $("productModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    syncBodyScrollLock();
    state.lastFocused?.focus?.();
    state.lastFocused = null;
  }

  function bindCart() {
    $("cartBtn")?.addEventListener("click", openCart);
    $("closeCart")?.addEventListener("click", closeCart);
    $("cartModal")?.addEventListener("click", (event) => {
      if (event.target.id === "cartModal") closeCart();
    });
    $("checkoutBtn")?.addEventListener("click", openCheckout);
    $("closeCheckout")?.addEventListener("click", closeCheckout);
    $("checkoutModal")?.addEventListener("click", (event) => {
      if (event.target.id === "checkoutModal") closeCheckout();
    });
    $("checkoutCity")?.addEventListener("input", updateCheckoutDeliveryFee);
    $("confirmCheckoutBtn")?.addEventListener("click", async () => {
      if (!loadCart().length) return showToast("Your cart is empty.");
      const details = $("checkoutDetails");
      const fields = details ? [...details.querySelectorAll("input, select")] : [];
      const invalidField = fields.find((field) => !field.checkValidity());
      if (invalidField) {
        invalidField.reportValidity();
        return;
      }
      try {
        const authResponse = await DripAPI.fetch("/api/auth/me", { credentials: "include" });
        const authData = await authResponse.json().catch(() => ({}));
        if (!authResponse.ok || !authData.account) {
          setSignedIn(false);
          closeCheckout();
          sessionStorage.setItem("dripcartel_return_to_checkout", "true");
          showToast("Your session has expired. Please sign in again.");
          window.setTimeout(() => { window.location.href = "account.html?return=checkout"; }, 350);
          return;
        }
        setSignedIn(true);
      } catch {
        showToast("We couldn't verify your account. Please try again.");
        return;
      }
      closeCheckout();
      startServerCheckout();
    });
  }

  function bindPaymentModal() {
    // The payment content is rebuilt dynamically. Keep the X button outside that
    // content and also use a delegated fallback so the close action remains
    // reliable even after payment screens are replaced.
    $("closePayment")?.addEventListener("click", closePayment);
    document.addEventListener("click", (event) => {
      const closeButton = event.target.closest?.("#closePayment");
      if (closeButton) {
        event.preventDefault();
        event.stopPropagation();
        closePayment();
      }
    }, true);

    $("paymentModal")?.addEventListener("click", (event) => {
      if (event.target.id === "paymentModal") closePayment();
    });
    $("paymentContent")?.addEventListener("click", (event) => {
      const action = event.target.closest("[data-payment-action]")?.dataset.paymentAction;
      if (action === "close") closePayment();
      if (action === "close") closePayment();
    });
  }

  function openCart() {
    const modal = $("cartModal");
    if (!modal) return;
    state.lastFocused = document.activeElement;
    renderCart();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    syncBodyScrollLock();
    $("closeCart")?.focus();
  }

  function closeCart() {
    const modal = $("cartModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    syncBodyScrollLock();
    state.lastFocused?.focus?.();
    state.lastFocused = null;
  }

  async function openCheckout() {
    if (!loadCart().length) return showToast("Your cart is empty.");

    // Checkout is an authenticated operation. Do not rely on the browser's
    // sessionStorage flag as proof of authentication; ask the API because the
    // server-side HttpOnly session cookie is the source of truth.
    try {
      const response = await DripAPI.fetch("/api/auth/me", { credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.account) {
        setSignedIn(false);
        sessionStorage.setItem("dripcartel_return_to_checkout", "true");
        showToast("Please sign in before checkout.");
        window.setTimeout(() => { window.location.href = "account.html?return=checkout"; }, 350);
        return;
      }
      setSignedIn(true);
    } catch {
      showToast("We couldn't verify your account. Please try again.");
      return;
    }

    closeCart();
    const modal = $("checkoutModal");
    if (!modal) return;
    state.lastFocused = document.activeElement;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    syncBodyScrollLock();
    window.requestAnimationFrame(() => $("checkoutName")?.focus({ preventScroll: true }));
    updateCheckoutDeliveryFee();
  }

  function isWitbankEmalahleniArea(city) {
    const normalized = String(city || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
    return normalized === "witbank" || normalized === "emalahleni";
  }

  function updateCheckoutDeliveryFee() {
    const city = $("checkoutCity")?.value || "";
    const fee = $("checkoutDeliveryFee");
    if (!fee) return;
    fee.textContent = isWitbankEmalahleniArea(city) ? "Free" : (city.trim() ? "R60.00" : "Enter your city");
  }

  function closeCheckout() {
    const modal = $("checkoutModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    syncBodyScrollLock();
    state.lastFocused?.focus?.();
    state.lastFocused = null;
  }

  function getCartTotal() {
    return loadCart().reduce((total, item) => {
      const product = state.products.find((entry) => entry.id === item.id);
      return total + (product ? product.price * item.qty : 0);
    }, 0);
  }

  function animatePaymentState(content) {
    content.classList.remove("payment-state-enter");
    void content.offsetWidth;
    content.classList.add("payment-state-enter");
  }

  function closePayment() {
    const modal = $("paymentModal");
    if (!modal) return;

    // Close first, then restore the page scroll/focus state. This prevents
    // the animated payment panel from intercepting the click during teardown.
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modal.style.pointerEvents = "none";
    syncBodyScrollLock();

    const returnFocus = state.lastFocused;
    state.lastFocused = null;
    if (returnFocus && document.contains(returnFocus)) {
      window.requestAnimationFrame(() => {
        try { returnFocus.focus({ preventScroll: true }); }
        catch { returnFocus.focus(); }
      });
    }
    window.setTimeout(() => {
      if (!modal.classList.contains("open")) modal.style.pointerEvents = "";
    }, 250);
  }

  function renderCart() {
    const box = $("cartItems");
    const cart = loadCart();
    if (!box) return;

    const validItems = cart.filter((item) => state.products.some((product) => product.id === item.id));
    if (!validItems.length) {
      box.innerHTML = `<div class="cart-empty"><img src="assets/dripcartel-icon.webp" alt=""><h3>Your cart is empty</h3><p>Add some drip to get started.</p></div>`;
      $("cartTotal").textContent = money(0);
      $("deliveryFee").textContent = "Calculated at checkout";
      return;
    }

    let total = 0;
    box.innerHTML = validItems.map((item) => {
      const product = state.products.find((entry) => entry.id === item.id);
      const size = item.size || getAvailableSizes(product)[0];
      total += product.price * item.qty;
      return `
        <div class="cart-line">
          <div>${productVisual(product)}</div>
          <div class="cart-meta">
            <strong>${escapeHTML(product.name)}</strong>
            <small>${money(product.price)} each · Size ${escapeHTML(size)}</small>
            <div class="qty">
              <button type="button" data-cart-action="decrease" data-product-id="${escapeHTML(product.id)}" data-product-size="${escapeHTML(size)}" aria-label="Decrease quantity">−</button>
              <span>${item.qty}</span>
              <button type="button" data-cart-action="increase" data-product-id="${escapeHTML(product.id)}" data-product-size="${escapeHTML(size)}" aria-label="Increase quantity">+</button>
              <button class="remove" type="button" data-cart-action="remove" data-product-id="${escapeHTML(product.id)}" data-product-size="${escapeHTML(size)}">Remove</button>
            </div>
          </div>
          <strong>${money(product.price * item.qty)}</strong>
        </div>`;
    }).join("");

    $("cartTotal").textContent = money(total);
    updateDeliveryFee(total);
    box.querySelectorAll("[data-cart-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.productId;
        const size = button.dataset.productSize;
        const action = button.dataset.cartAction;
        if (action === "increase") changeQty(id, size, 1);
        if (action === "decrease") changeQty(id, size, -1);
        if (action === "remove") removeFromCart(id, size);
      });
    });
  }

  function updateDeliveryFee(subtotal) {
    const cart = loadCart();
    if (!cart.length) return;
    const currentSubtotal = typeof subtotal === "number" ? subtotal : cart.reduce((sum, item) => {
      const product = state.products.find((entry) => entry.id === item.id);
      return sum + (product ? product.price * item.qty : 0);
    }, 0);
    $("deliveryFee").textContent = "Calculated at checkout";
    $("cartTotal").textContent = money(currentSubtotal);
  }

  function changeQty(id, size, delta) {
    const cart = loadCart();
    const product = state.products.find((entry) => entry.id === id);
    const fallbackSize = product ? getAvailableSizes(product)[0] : size;
    const item = cart.find((entry) => entry.id === id && (entry.size || fallbackSize) === size);
    if (!item || !product) return;

    item.qty += delta;
    if (item.qty > product.stock) {
      item.qty = product.stock;
      showToast("You reached the available stock.");
    }
    if (item.qty <= 0) cart.splice(cart.indexOf(item), 1);
    saveCart(cart);
    renderCart();
  }

  function removeFromCart(id, size) {
    const product = state.products.find((entry) => entry.id === id);
    const fallbackSize = product ? getAvailableSizes(product)[0] : size;
    saveCart(loadCart().filter((item) => !(item.id === id && (item.size || fallbackSize) === size)));
    renderCart();
    showToast("Item removed from cart.");
  }

  function addToCart(id, size) {
    const product = state.products.find((item) => item.id === id);
    if (!product || product.stock < 1) return showToast("This product is sold out.");
    if (!size) return showToast("Choose a size first.");

    const cart = loadCart();
    const item = cart.find((entry) => entry.id === id && entry.size === size);
    if (item) {
      if (item.qty >= product.stock) return showToast("You reached the available stock.");
      item.qty += 1;
    } else {
      cart.push({ id, size, qty: 1 });
    }
    saveCart(cart);
    showCartConfirmation(product, size);
  }

  function updateCartCount() {
    const count = loadCart().reduce((total, item) => total + Number(item.qty || 0), 0);
    const badge = $("cartCount");
    if (badge) badge.textContent = String(count);
  }

  function showCartConfirmation(product, size) {
    const toast = $("toast");
    if (!toast) return;
    toast.innerHTML = `<span class="toast-check" aria-hidden="true">✓</span><span class="toast-message"><strong>Added to cart</strong><span>${escapeHTML(product.name)} · Size ${escapeHTML(size)}</span></span><button class="toast-action" type="button">View cart</button>`;
    toast.classList.add("toast-confirmation", "show");
    toast.querySelector(".toast-action")?.addEventListener("click", () => {
      toast.classList.remove("show", "toast-confirmation");
      openCart();
    }, { once: true });
    clearTimeout(window.__toast);
    window.__toast = window.setTimeout(() => toast.classList.remove("show", "toast-confirmation"), 4200);
  }

  function showToast(message) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("toast-confirmation");
    toast.classList.add("show");
    clearTimeout(window.__toast);
    window.__toast = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function bindNewsletter() {
    $("newsletterForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      showToast("Welcome to the Cartel.");
      event.target.reset();
    });
  }

  function initJournalReveal() {
    const journal = $("journal");
    const reveal = journal?.querySelector(".journal-reveal");
    if (!journal || !reveal) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      reveal.classList.add("is-visible");
      return;
    }

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      reveal.classList.add("is-visible");
    };

    if (!("IntersectionObserver" in window)) {
      start();
      return;
    }

    const observer = new IntersectionObserver((entries, instance) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      start();
      instance.disconnect();
    }, { threshold: 0.35 });
    observer.observe(journal);
  }

  function initCarousel() {
    const track = $("heroCarouselTrack");
    const dots = $("heroDots");
    const prev = $("heroPrev");
    const next = $("heroNext");
    const carousel = $("heroCarousel");
    if (!track || !dots || !prev || !next || !carousel) return;

    const slides = [...track.children];
    if (slides.length < 2) return;
    let index = 0;
    let timer = null;

    dots.innerHTML = slides.map((_, i) => `<button class="carousel-dot${i === 0 ? " active" : ""}" type="button" aria-label="Show product image ${i + 1}" aria-current="${i === 0 ? "true" : "false"}"></button>`).join("");

    const goTo = (target) => {
      index = (target + slides.length) % slides.length;
      track.style.transform = `translate3d(-${index * 100}%,0,0)`;
      $$(".carousel-dot", dots).forEach((dot, i) => {
        dot.classList.toggle("active", i === index);
        dot.setAttribute("aria-current", String(i === index));
      });
    };

    const restart = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => goTo(index + 1), 4500);
    };

    prev.addEventListener("click", () => { goTo(index - 1); restart(); });
    next.addEventListener("click", () => { goTo(index + 1); restart(); });
    $$(".carousel-dot", dots).forEach((dot, i) => dot.addEventListener("click", () => { goTo(i); restart(); }));
    carousel.addEventListener("mouseenter", () => window.clearInterval(timer));
    carousel.addEventListener("mouseleave", restart);
    carousel.addEventListener("focusin", () => window.clearInterval(timer));
    carousel.addEventListener("focusout", restart);
    restart();
  }

  function handleEscape(event) {
    if (event.key !== "Escape") return;
    if ($("paymentModal")?.classList.contains("open")) return closePayment();
    if ($("productModal")?.classList.contains("open")) return closeProduct();
    if ($("cartModal")?.classList.contains("open")) return closeCart();
    closeSearch();
    closeMobileMenu();
  }

  document.addEventListener("keydown", handleEscape);
})();
