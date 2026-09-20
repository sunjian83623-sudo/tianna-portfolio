/**
 * 站点渲染器 - 根据 config 动态生成 DOM
 * 依赖：window.Storage（解析 idb:// 资源引用）
 */
(function (global) {
  "use strict";

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k.startsWith("data-")) node.setAttribute(k, attrs[k]);
        else if (k === "style" && typeof attrs[k] === "object") {
          Object.keys(attrs[k]).forEach(function (p) { node.style[p] = attrs[k][p]; });
        } else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function srcOf(obj, field) {
    if (!obj) return null;
    if (field === "avatar" && obj._resolvedAvatar) return obj._resolvedAvatar;
    if (field === "poster" && obj._resolvedPoster) return obj._resolvedPoster;
    if (field === "heroImage" && obj._resolvedHeroImage) return obj._resolvedHeroImage;
    if (obj._resolvedSrc) return obj._resolvedSrc;
    return obj[field || "src"] || null;
  }

  function esc(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  // ---------- 各 item 类型的渲染 ----------
  var renderers = {
    "image-grid": function (item) {
      var grid = el("div", { class: "image-grid", "data-columns": item.columns || 2 });
      (item.images || []).forEach(function (img, idx) {
        var src = img._resolvedSrc || img.src;
        var card = el("figure", { class: "image-card" }, [
          src
            ? el("img", { src: src, alt: esc(img.caption || ""), loading: "lazy" })
            : el("div", { class: "image-placeholder" }, ["无图"]),
          img.caption ? el("figcaption", { class: "image-caption" }, [esc(img.caption)]) : null
        ]);
        grid.appendChild(card);
      });
      return grid;
    },

    "character-cards": function (item) {
      var grid = el("div", { class: "character-grid" });
      (item.cards || []).forEach(function (card) {
        var avatar = card._resolvedAvatar || card.avatar;
        var node = el("article", { class: "character-card" }, [
          avatar
            ? el("div", { class: "character-avatar" }, [el("img", { src: avatar, alt: esc(card.name || "") })])
            : el("div", { class: "character-avatar character-avatar--placeholder" }, [esc((card.name || "?").slice(0, 1))]),
          el("div", { class: "character-info" }, [
            el("h4", { class: "character-name" }, [esc(card.name || "")]),
            card.desc ? el("p", { class: "character-desc" }, [esc(card.desc)]) : null
          ])
        ]);
        grid.appendChild(node);
      });
      return grid;
    },

    "script-block": function (item) {
      return el("article", { class: "script-block" }, [
        el("h4", { class: "script-project" }, [esc(item.projectName || "")]),
        item.genre ? el("div", { class: "script-genre" }, [esc(item.genre)]) : null,
        item.synopsis ? el("p", { class: "script-synopsis" }, [esc(item.synopsis)]) : null
      ]);
    },

    "video-gallery": function (item) {
      var grid = el("div", { class: "video-grid" });
      (item.videos || []).forEach(function (v) {
        var poster = v._resolvedPoster || v.poster;
        var src = v._resolvedSrc || v.src;
        var node;
        if (src) {
          // 有真实视频：默认用 16:9 占位，加载元数据后按真实比例自适应
          node = el("figure", { class: "video-card video-card--adaptive", style: { aspectRatio: "16 / 9" } }, [
            (function () {
              var vid = el("video", {
                src: src,
                poster: poster || "",
                controls: "controls",
                preload: "metadata",
                class: "video-player"
              });
              // 读取视频真实宽高，按比例自适应容器
              vid.addEventListener("loadedmetadata", function () {
                var w = vid.videoWidth || 16;
                var h = vid.videoHeight || 9;
                node.style.aspectRatio = w + " / " + h;
              });
              return vid;
            })(),
            v.title ? el("figcaption", { class: "video-title" }, [esc(v.title)]) : null
          ]);
        } else {
          // 无视频占位：保持竖屏 9:16
          node = el("figure", { class: "video-card video-card--placeholder" }, [
            poster
              ? el("img", { src: poster, alt: esc(v.title || ""), class: "video-poster" })
              : el("div", { class: "video-poster video-poster--empty" }, ["待上传视频"]),
            el("div", { class: "video-badge" }, [esc(v.duration || "")]),
            v.title ? el("figcaption", { class: "video-title" }, [esc(v.title)]) : null
          ]);
        }
        grid.appendChild(node);
      });
      return grid;
    },

    "text-block": function (item) {
      return el("div", { class: "text-block" }, [
        item.title ? el("h3", { class: "text-block-title" }, [esc(item.title)]) : null,
        item.content ? el("p", { class: "text-block-content" }, [esc(item.content)]) : null
      ]);
    }
  };

  function renderItem(item) {
    var fn = renderers[item.type];
    if (!fn) return el("div", { class: "unknown-item" }, ["未知组件类型: " + item.type]);
    var section = el("section", { class: "item item--" + item.type, "data-item-id": item.id || "" });
    if (item.title) section.appendChild(el("h3", { class: "item-title" }, [esc(item.title)]));
    section.appendChild(fn(item));
    return section;
  }

  function renderSection(section) {
    var sec = el("section", { class: "work-section", id: section.id, "data-section-id": section.id });
    var header = el("header", { class: "work-section__header" }, [
      section.number ? el("span", { class: "work-section__number" }, [esc(section.number)]) : null,
      el("div", { class: "work-section__titles" }, [
        el("h2", { class: "work-section__title" }, [esc(section.title || "")]),
        section.subtitle ? el("span", { class: "work-section__subtitle" }, [esc(section.subtitle)]) : null
      ])
    ]);
    sec.appendChild(header);
    var body = el("div", { class: "work-section__body" });
    (section.items || []).forEach(function (item) { body.appendChild(renderItem(item)); });
    sec.appendChild(body);
    return sec;
  }

  function renderHero(site) {
    var hero = el("section", { class: "hero" });
    var heroSrc = site._resolvedHeroImage || site.heroImage;
    hero.appendChild(el("div", { class: "hero__inner" }, [
      heroSrc
        ? el("div", { class: "hero__avatar" }, [el("img", { src: heroSrc, alt: esc(site.title || "") })])
        : el("div", { class: "hero__avatar hero__avatar--placeholder" }),
      el("div", { class: "hero__text" }, [
        site.subtitle ? el("div", { class: "hero__subtitle" }, [esc(site.subtitle)]) : null,
        el("h1", { class: "hero__title" }, [esc(site.title || "")]),
        site.heroTagline ? el("div", { class: "hero__tagline" }, [esc(site.heroTagline)]) : null
      ])
    ]));
    return hero;
  }

  function renderProfile(profile) {
    var avatar = profile._resolvedAvatar || profile.avatar;
    var info = el("section", { class: "profile" }, [
      el("div", { class: "profile__avatar" }, [
        avatar ? el("img", { src: avatar, alt: esc(profile.name || "") }) : el("div", { class: "profile__avatar--placeholder" }, [esc((profile.name || "?").slice(0, 1))])
      ]),
      el("div", { class: "profile__body" }, [
        el("h2", { class: "profile__name" }, [esc(profile.name || "")]),
        el("dl", { class: "profile__info" },
          (profile.basicInfo || []).reduce(function (acc, row) {
            acc.push(el("dt", { class: "profile__label" }, [esc(row.label || "")]));
            acc.push(el("dd", { class: "profile__value" }, [esc(row.value || "")]));
            return acc;
          }, [])
        ),
        (profile.tags && profile.tags.length)
          ? el("div", { class: "profile__tags" },
              profile.tags.map(function (t) { return el("span", { class: "tag" }, [esc(t)]); })
            )
          : null,
        el("ul", { class: "profile__meta" }, [
          profile.status ? el("li", {}, [el("span", { class: "meta-label" }, ["状态："]), el("span", {}, [esc(profile.status)])]) : null,
          profile.sports ? el("li", {}, [el("span", { class: "meta-label" }, ["运动："]), el("span", {}, [esc(profile.sports)])]) : null,
          profile.hobbies ? el("li", {}, [el("span", { class: "meta-label" }, ["爱好："]), el("span", {}, [esc(profile.hobbies)])]) : null
        ]),
        profile.bio ? el("p", { class: "profile__bio" }, [esc(profile.bio)]) : null
      ])
    ]);
    return info;
  }

  function renderFooter(footer) {
    var f = el("footer", { class: "site-footer" }, [
      el("nav", { class: "site-footer__nav" },
        (footer.links || []).map(function (l) {
          return el("a", { class: "site-footer__link", href: l.url || "#", target: l.url && l.url !== "#" ? "_blank" : null, rel: "noopener" }, [esc(l.text || "")]);
        })
      ),
      footer.copyright ? el("div", { class: "site-footer__copyright" }, [esc(footer.copyright)]) : null,
      el("a", { class: "site-footer__admin-link", href: "admin.html" }, ["管理后台 →"])
    ]);
    return f;
  }

  function renderAll(config, mount) {
    if (!mount) mount = document.getElementById("app");
    mount.innerHTML = "";
    mount.appendChild(renderHero(config.site));
    mount.appendChild(renderProfile(config.profile));
    var main = el("main", { class: "work" });
    (config.sections || []).forEach(function (section) {
      main.appendChild(renderSection(section));
    });
    mount.appendChild(main);
    mount.appendChild(renderFooter(config.footer));
  }

  global.SiteRenderer = {
    renderAll: renderAll,
    renderHero: renderHero,
    renderProfile: renderProfile,
    renderSection: renderSection,
    renderFooter: renderFooter
  };
})(window);
