/**
 * 管理后台 - 可视化表单编辑器
 * 依赖：window.Storage
 *
 * 设计：直接持有 config 对象，所有输入控件直接 mutate 该对象，
 * 保存时调用 Storage.setConfig 持久化到 localStorage。
 */
(function () {
  "use strict";

  // ---------- DOM helpers ----------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k.startsWith("data-")) node.setAttribute(k, attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null || c === false) return;
        node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
      });
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ---------- State ----------
  var state = {
    config: null,
    dirty: false,
    saving: false,
    collapsedPanels: new Set()
  };

  // ---------- Toast ----------
  var toastTimer = null;
  function toast(msg, kind) {
    var existing = document.querySelector(".toast");
    if (existing) existing.remove();
    if (toastTimer) clearTimeout(toastTimer);
    var t = el("div", { class: "toast" + (kind ? " toast--" + kind : ""), text: msg });
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("is-visible"); });
    toastTimer = setTimeout(function () {
      t.classList.remove("is-visible");
      setTimeout(function () { t.remove(); }, 200);
    }, 2400);
  }

  // ---------- Dirty tracking + auto-save ----------
  var autoSaveTimer = null;
  var AUTO_SAVE_DELAY = 800; // ms

  function doSave(silent) {
    try {
      Storage.setConfig(state.config);
      state.dirty = false;
      state.saving = true;
      updateSaveStatus();
      // 异步推送到 Supabase
      Storage.setConfigAsync(state.config).then(function (ok) {
        state.saving = false;
        updateSaveStatus();
        if (!silent) {
          if (ok) toast("已保存并同步到云端", "success");
          else toast("已保存本地", "info");
        }
      });
      return true;
    } catch (e) {
      state.saving = false;
      updateSaveStatus();
      toast("保存失败：" + (e.message || e), "error");
      return false;
    }
  }

  function markDirty() {
    state.dirty = true;
    state.saving = true;
    updateSaveStatus();
    // Debounced auto-save
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function () {
      autoSaveTimer = null;
      doSave(true);
    }, AUTO_SAVE_DELAY);
  }
  function markSaved() {
    state.dirty = false;
    state.saving = false;
    updateSaveStatus();
  }
  function updateSaveStatus() {
    var s = document.getElementById("saveStatus");
    if (!s) return;
    if (state.saving) {
      s.textContent = "自动保存中…";
      s.className = "save-status is-dirty";
    } else if (state.dirty) {
      s.textContent = "未保存的修改";
      s.className = "save-status is-dirty";
    } else {
      s.textContent = "已保存 ✓";
      s.className = "save-status is-saved";
    }
  }

  // ---------- Basic input builders ----------
  function textInput(value, onInput, opts) {
    opts = opts || {};
    var input = el("input", {
      type: opts.type || "text",
      class: "input" + (opts.small ? " input--small" : ""),
      value: value == null ? "" : String(value)
    });
    if (opts.placeholder) input.setAttribute("placeholder", opts.placeholder);
    input.addEventListener("input", function () {
      onInput(input.value);
      markDirty();
    });
    return input;
  }

  function textareaInput(value, onInput, opts) {
    opts = opts || {};
    var ta = el("textarea", { class: "textarea" });
    if (opts.placeholder) ta.setAttribute("placeholder", opts.placeholder);
    if (opts.rows) ta.setAttribute("rows", String(opts.rows));
    ta.value = value == null ? "" : String(value);
    ta.addEventListener("input", function () {
      onInput(ta.value);
      markDirty();
    });
    return ta;
  }

  function numberInput(value, onInput, opts) {
    opts = opts || {};
    var input = el("input", {
      type: "number",
      class: "input input--small",
      value: value == null ? "" : String(value),
      min: opts.min != null ? String(opts.min) : null,
      max: opts.max != null ? String(opts.max) : null,
      step: opts.step != null ? String(opts.step) : null
    });
    input.addEventListener("input", function () {
      var v = parseInt(input.value, 10);
      onInput(isNaN(v) ? null : v);
      markDirty();
    });
    return input;
  }

  function selectInput(value, options, onInput) {
    var sel = el("select", { class: "select input--small" });
    options.forEach(function (opt) {
      var o = el("option", { value: opt.value, text: opt.label });
      if (String(value) === String(opt.value)) o.setAttribute("selected", "selected");
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      onInput(sel.value);
      markDirty();
    });
    return sel;
  }

  // ---------- Field row ----------
  function field(labelText, control, hint) {
    return el("div", { class: "field-row" }, [
      el("label", { text: labelText }),
      el("div", { class: "field-control" }, [
        control,
        hint ? el("div", { class: "field-hint", text: hint }) : null
      ])
    ]);
  }

  // ---------- Tag input ----------
  function tagInput(tags, onChange) {
    tags = tags || [];
    var wrap = el("div", { class: "tag-input" });
    var input = el("input", { class: "tag-input__input", type: "text", placeholder: "输入后按回车添加" });

    function render() {
      // remove existing tags but keep input
      Array.from(wrap.querySelectorAll(".tag-input__tag")).forEach(function (n) { n.remove(); });
      tags.forEach(function (t, idx) {
        var tag = el("span", { class: "tag-input__tag" }, [
          document.createTextNode(t),
          el("button", { type: "button", "data-idx": String(idx), text: "×" })
        ]);
        tag.querySelector("button").addEventListener("click", function () {
          tags.splice(idx, 1);
          onChange(tags.slice());
          render();
          markDirty();
        });
        wrap.insertBefore(tag, input);
      });
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        var v = input.value.trim().replace(/,$/, "");
        if (v && tags.indexOf(v) === -1) {
          tags.push(v);
          onChange(tags.slice());
          input.value = "";
          render();
          markDirty();
        }
      } else if (e.key === "Backspace" && !input.value && tags.length) {
        tags.pop();
        onChange(tags.slice());
        render();
        markDirty();
      }
    });
    wrap.appendChild(input);
    render();
    return wrap;
  }

  // ---------- Media picker ----------
  // value: string (path or "idb://...")
  // type: "image" | "video"
  // onChange: function(newValue)
  function mediaPicker(value, type, onChange) {
    var wrap = el("div", { class: "media-picker" });
    var preview = el("div", { class: "media-picker__preview" + (type === "video" ? " media-picker__preview--video" : "") });
    var urlInput = el("input", {
      class: "input",
      type: "text",
      placeholder: type === "video" ? "视频 URL 或上传文件" : "图片 URL 或上传文件",
      value: value && value.indexOf("idb://") === 0 ? "" : (value || "")
    });
    var refLabel = el("div", { class: "media-picker__ref" });

    function refreshPreview() {
      clear(preview);
      if (!value) {
        preview.appendChild(el("span", { text: type === "video" ? "无视频" : "无图片" }));
        refLabel.textContent = "";
        return;
      }
      Storage.resolveSrc(value).then(function (url) {
        clear(preview);
        if (!url) { preview.appendChild(el("span", { text: "无法加载" })); return; }
        if (type === "video") {
          var v = el("video", { src: url, controls: "controls", preload: "metadata" });
          preview.appendChild(v);
        } else {
          preview.appendChild(el("img", { src: url, alt: "" }));
        }
      });
      refLabel.textContent = value.indexOf("idb://") === 0 ? "已上传文件：" + value : "路径：" + value;
    }

    urlInput.addEventListener("input", function () {
      value = urlInput.value.trim();
      onChange(value);
      refreshPreview();
      markDirty();
    });

    // Upload button
    var uploadBtn = el("button", { type: "button", class: "btn btn--sm", text: "上传文件" });
    uploadBtn.addEventListener("click", function () {
      var fileInput = document.getElementById("hiddenFileInput");
      fileInput.value = "";
      fileInput.accept = type === "video" ? "video/*" : "image/*";
      fileInput.onchange = function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        var sizeMB = file.size / 1024 / 1024;
        var maxMB = type === "video" ? 100 : 10;
        if (sizeMB > maxMB) {
          toast("文件过大（" + sizeMB.toFixed(1) + "MB > " + maxMB + "MB 上限）", "error");
          return;
        }
        toast("上传中…");
        Storage.saveAsset(file).then(function (ref) {
          value = ref;
          urlInput.value = "";
          onChange(value);
          refreshPreview();
          markDirty();
          toast("已上传", "success");
        }).catch(function (err) {
          toast("上传失败：" + (err.message || err), "error");
        });
      };
      fileInput.click();
    });

    // Clear button
    var clearBtn = el("button", { type: "button", class: "btn btn--sm", text: "清除" });
    clearBtn.addEventListener("click", function () {
      if (!confirm("确认清除该资源引用？")) return;
      value = "";
      urlInput.value = "";
      onChange(value);
      refreshPreview();
      markDirty();
    });

    var body = el("div", { class: "media-picker__body" }, [
      el("div", { class: "media-picker__url-row" }, [urlInput]),
      refLabel,
      el("div", { class: "media-picker__actions" }, [uploadBtn, clearBtn])
    ]);
    wrap.appendChild(preview);
    wrap.appendChild(body);
    refreshPreview();
    return wrap;
  }

  // ---------- Panel ----------
  function panel(title, bodyNodes, opts) {
    opts = opts || {};
    var id = opts.id || ("panel-" + Math.random().toString(36).slice(2, 8));
    var body = el("div", { class: "panel__body" }, bodyNodes);
    var header = el("div", { class: "panel__header" }, [
      el("h3", { class: "panel__title" }, [
        document.createTextNode(title),
        opts.badge ? el("span", { class: "panel__badge", text: opts.badge }) : null
      ]),
      el("span", { class: "panel__toggle" })
    ]);
    var p = el("section", { class: "panel section-anchor" + (state.collapsedPanels.has(id) ? " is-collapsed" : ""), id: id }, [header, body]);
    header.addEventListener("click", function () {
      p.classList.toggle("is-collapsed");
      if (p.classList.contains("is-collapsed")) state.collapsedPanels.add(id);
      else state.collapsedPanels.delete(id);
    });
    return p;
  }

  // ---------- Repeatable list ----------
  // items: array (mutated in place)
  // renderItem(item, idx, rerender): returns [bodyNode, titleStr]
  // onAdd(): creates a new item and pushes
  // addLabel: string
  function repeatList(items, opts) {
    var wrap = el("div", { class: "repeat-list" });
    var rerenderFn = null;

    function rerender() {
      clear(wrap);
      if (!items || !items.length) {
        wrap.appendChild(el("div", { class: "empty-hint", text: opts.emptyHint || "（空）" }));
      } else {
        items.forEach(function (item, idx) {
          var result = opts.renderItem(item, idx, function () { rerender(); });
          var titleStr = result.title || ("#" + (idx + 1));
          var bodyNode = result.body;

          var moveUp = el("button", { type: "button", class: "btn btn--sm", title: "上移", text: "↑" });
          moveUp.disabled = idx === 0;
          moveUp.addEventListener("click", function () {
            if (idx === 0) return;
            var t = items[idx - 1];
            items[idx - 1] = items[idx];
            items[idx] = t;
            markDirty();
            rerender();
          });
          var moveDown = el("button", { type: "button", class: "btn btn--sm", title: "下移", text: "↓" });
          moveDown.disabled = idx === items.length - 1;
          moveDown.addEventListener("click", function () {
            if (idx === items.length - 1) return;
            var t = items[idx + 1];
            items[idx + 1] = items[idx];
            items[idx] = t;
            markDirty();
            rerender();
          });
          var dupBtn = el("button", { type: "button", class: "btn btn--sm", title: "复制", text: "⎘" });
          dupBtn.addEventListener("click", function () {
            var copy = JSON.parse(JSON.stringify(item));
            // strip resolved cache
            (function strip(o) {
              if (!o || typeof o !== "object") return;
              delete o._resolvedSrc; delete o._resolvedAvatar; delete o._resolvedPoster; delete o._resolvedHeroImage;
              if (Array.isArray(o)) o.forEach(strip);
              else Object.keys(o).forEach(function (k) { strip(o[k]); });
            })(copy);
            items.splice(idx + 1, 0, copy);
            markDirty();
            rerender();
          });
          var rmBtn = el("button", { type: "button", class: "btn btn--sm btn--danger", title: "删除", text: "删除" });
          rmBtn.addEventListener("click", function () {
            if (!confirm("确认删除第 " + (idx + 1) + " 项？")) return;
            items.splice(idx, 1);
            markDirty();
            rerender();
          });

          var itemEl = el("div", { class: "repeat-item" }, [
            el("div", { class: "repeat-item__header" }, [
              el("span", { class: "repeat-item__title", text: titleStr }),
              el("div", { class: "repeat-item__actions" }, [moveUp, moveDown, dupBtn, rmBtn])
            ]),
            el("div", { class: "repeat-item__body" }, [bodyNode])
          ]);
          wrap.appendChild(itemEl);
        });
      }
      var addBtn = el("button", { type: "button", class: "repeat-add", text: "+ " + (opts.addLabel || "添加") });
      addBtn.addEventListener("click", function () {
        opts.onAdd();
        markDirty();
        rerender();
      });
      wrap.appendChild(addBtn);
    }
    rerender();
    return wrap;
  }

  // ---------- Item renderers by type ----------
  function renderImageGridItem(item, idx, rerender) {
    var body = el("div", {}, [
      field("标题", textInput(item.title, function (v) { item.title = v; })),
      field("列数", numberInput(item.columns || 2, function (v) { item.columns = v; }, { min: 1, max: 4 })),
      el("div", { class: "field-row" }, [
        el("label", { text: "图片列表" }),
        el("div", { class: "field-control" }, [
          repeatList(item.images || (item.images = []), {
            addLabel: "添加图片",
            emptyHint: "（无图片）",
            renderItem: function (img, i, r) {
              var body = el("div", {}, [
                mediaPicker(img.src, "image", function (v) { img.src = v; }),
                field("说明文字", textareaInput(img.caption, function (v) { img.caption = v; }, { rows: 2 }))
              ]);
              return { title: "图片 " + (i + 1), body: body };
            },
            onAdd: function () {
              item.images.push({ src: "", caption: "" });
            }
          })
        ])
      ])
    ]);
    return { title: "图片网格：" + (item.title || "未命名"), body: body };
  }

  function renderCharacterCardsItem(item, idx, rerender) {
    var body = el("div", {}, [
      field("标题", textInput(item.title, function (v) { item.title = v; })),
      el("div", { class: "field-row" }, [
        el("label", { text: "角色卡片" }),
        el("div", { class: "field-control" }, [
          repeatList(item.cards || (item.cards = []), {
            addLabel: "添加角色",
            emptyHint: "（无角色）",
            renderItem: function (card, i, r) {
              var body = el("div", {}, [
                mediaPicker(card.avatar, "image", function (v) { card.avatar = v; }),
                field("姓名", textInput(card.name, function (v) { card.name = v; })),
                field("描述", textareaInput(card.desc, function (v) { card.desc = v; }, { rows: 3 }))
              ]);
              return { title: card.name || ("角色 " + (i + 1)), body: body };
            },
            onAdd: function () {
              item.cards.push({ name: "", desc: "", avatar: "" });
            }
          })
        ])
      ])
    ]);
    return { title: "角色卡片：" + (item.title || "未命名"), body: body };
  }

  function renderScriptBlockItem(item, idx, rerender) {
    var body = el("div", {}, [
      field("标题", textInput(item.title, function (v) { item.title = v; })),
      field("项目名", textInput(item.projectName, function (v) { item.projectName = v; })),
      field("题材", textInput(item.genre, function (v) { item.genre = v; })),
      field("剧情介绍", textareaInput(item.synopsis, function (v) { item.synopsis = v; }, { rows: 6 }))
    ]);
    return { title: "分镜脚本：" + (item.projectName || item.title || "未命名"), body: body };
  }

  function renderVideoGalleryItem(item, idx, rerender) {
    var body = el("div", {}, [
      field("标题", textInput(item.title, function (v) { item.title = v; })),
      el("div", { class: "field-row" }, [
        el("label", { text: "视频列表" }),
        el("div", { class: "field-control" }, [
          repeatList(item.videos || (item.videos = []), {
            addLabel: "添加视频",
            emptyHint: "（无视频）",
            renderItem: function (v, i, r) {
              var body = el("div", {}, [
                el("div", {}, [
                  el("div", { class: "field-hint", text: "视频文件：" }),
                  mediaPicker(v.src, "video", function (val) { v.src = val; })
                ]),
                field("封面图", mediaPicker(v.poster, "image", function (val) { v.poster = val; })),
                field("标题", textInput(v.title, function (val) { v.title = val; })),
                field("时长", textInput(v.duration, function (val) { v.duration = val; }, { small: true, placeholder: "0:08" }))
              ]);
              return { title: v.title || ("视频 " + (i + 1)), body: body };
            },
            onAdd: function () {
              item.videos.push({ src: "", poster: "", title: "", duration: "" });
            }
          })
        ])
      ])
    ]);
    return { title: "视频集：" + (item.title || "未命名"), body: body };
  }

  function renderTextBlockItem(item, idx, rerender) {
    var body = el("div", {}, [
      field("标题", textInput(item.title, function (v) { item.title = v; })),
      field("内容", textareaInput(item.content, function (v) { item.content = v; }, { rows: 4 }))
    ]);
    return { title: "文本块：" + (item.title || "未命名"), body: body };
  }

  var ITEM_RENDERERS = {
    "image-grid": renderImageGridItem,
    "character-cards": renderCharacterCardsItem,
    "script-block": renderScriptBlockItem,
    "video-gallery": renderVideoGalleryItem,
    "text-block": renderTextBlockItem
  };
  var ITEM_TYPES = [
    { value: "image-grid", label: "图片网格" },
    { value: "character-cards", label: "角色卡片" },
    { value: "script-block", label: "分镜脚本" },
    { value: "video-gallery", label: "视频集" },
    { value: "text-block", label: "文本块" }
  ];

  function renderSectionItem(item, idx, rerender) {
    var renderer = ITEM_RENDERERS[item.type] || renderTextBlockItem;
    var inner = renderer(item, idx, rerender);
    var typeSel = selectInput(item.type, ITEM_TYPES, function (v) {
      item.type = v;
      // 切换类型时补默认结构
      if (item.type === "image-grid" && !item.images) item.images = [];
      if (item.type === "character-cards" && !item.cards) item.cards = [];
      if (item.type === "video-gallery" && !item.videos) item.videos = [];
      markDirty();
      rerender();
    });
    var body = el("div", {}, [
      field("组件类型", typeSel, "切换类型会重新渲染该组件"),
      inner.body
    ]);
    return { title: "[" + item.type + "] " + (inner.title || ""), body: body };
  }

  // ---------- Top-level panels ----------
  function buildSitePanel(site) {
    return panel("站点信息", [
      field("站点标题", textInput(site.title, function (v) { site.title = v; })),
      field("副标题", textInput(site.subtitle, function (v) { site.subtitle = v; })),
      field("Hero 标语", textInput(site.heroTagline, function (v) { site.heroTagline = v; })),
      field("Hero 主图", mediaPicker(site.heroImage, "image", function (v) { site.heroImage = v; }), "建议方形图片，会圆形裁剪显示")
    ], { id: "panel-site" });
  }

  function buildProfilePanel(profile) {
    return panel("个人介绍", [
      field("姓名", textInput(profile.name, function (v) { profile.name = v; })),
      field("头像", mediaPicker(profile.avatar, "image", function (v) { profile.avatar = v; })),
      field("个人简介", textareaInput(profile.bio, function (v) { profile.bio = v; }, { rows: 4 })),
      el("div", { class: "field-row" }, [
        el("label", { text: "基本信息" }),
        el("div", { class: "field-control" }, [
          repeatList(profile.basicInfo || (profile.basicInfo = []), {
            addLabel: "添加信息项",
            emptyHint: "（无）",
            renderItem: function (row, i, r) {
              var body = el("div", {}, [
                field("标签", textInput(row.label, function (v) { row.label = v; }, { small: true, placeholder: "出生 / 地区 / ..." })),
                field("内容", textInput(row.value, function (v) { row.value = v; }))
              ]);
              return { title: (row.label || "信息") + "：" + (row.value || ""), body: body };
            },
            onAdd: function () { profile.basicInfo.push({ label: "", value: "" }); }
          })
        ])
      ]),
      field("标签", tagInput(profile.tags || (profile.tags = []), function (v) { profile.tags = v; }), "回车添加，如：西安 / 汉族 / 天蝎座"),
      field("状态", textInput(profile.status, function (v) { profile.status = v; })),
      field("运动", textInput(profile.sports, function (v) { profile.sports = v; })),
      field("爱好", textInput(profile.hobbies, function (v) { profile.hobbies = v; }))
    ], { id: "panel-profile" });
  }

  function buildSectionPanel(section, idx) {
    var body = el("div", {}, [
      field("编号", textInput(section.number, function (v) { section.number = v; }, { small: true, placeholder: "01" })),
      field("标题", textInput(section.title, function (v) { section.title = v; })),
      field("副标题", textInput(section.subtitle, function (v) { section.subtitle = v; })),
      el("div", { class: "field-row" }, [
        el("label", { text: "组件列表" }),
        el("div", { class: "field-control" }, [
          repeatList(section.items || (section.items = []), {
            addLabel: "添加组件",
            emptyHint: "（无组件，点击下方按钮添加）",
            renderItem: renderSectionItem,
            onAdd: function () {
              section.items.push({ type: "image-grid", id: "item-" + Date.now().toString(36), title: "新组件", columns: 2, images: [] });
            }
          })
        ])
      ])
    ]);
    return panel("作品集 " + (section.number || (idx + 1)) + " · " + (section.title || "未命名"), [body], {
      id: "panel-section-" + (section.id || idx),
      badge: section.id
    });
  }

  function buildFooterPanel(footer) {
    return panel("页脚", [
      field("版权", textInput(footer.copyright, function (v) { footer.copyright = v; })),
      el("div", { class: "field-row" }, [
        el("label", { text: "链接列表" }),
        el("div", { class: "field-control" }, [
          repeatList(footer.links || (footer.links = []), {
            addLabel: "添加链接",
            emptyHint: "（无链接）",
            renderItem: function (link, i, r) {
              var body = el("div", {}, [
                field("文字", textInput(link.text, function (v) { link.text = v; })),
                field("URL", textInput(link.url, function (v) { link.url = v; }, { placeholder: "# 或 https://..." }))
              ]);
              return { title: link.text || ("链接 " + (i + 1)), body: body };
            },
            onAdd: function () { footer.links.push({ text: "", url: "#" }); }
          })
        ])
      ])
    ], { id: "panel-footer" });
  }

  function buildAdvancedPanel() {
    var exportBtn = el("button", { type: "button", class: "btn btn--block", text: "导出当前配置为 JSON 文件" });
    exportBtn.addEventListener("click", function () {
      var data = JSON.stringify(state.config, null, 2);
      var blob = new Blob([data], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "tianna-config-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("已导出 JSON", "success");
    });

    var importBtn = el("button", { type: "button", class: "btn btn--block", text: "从 JSON 文件导入并替换当前配置" });
    importBtn.addEventListener("click", function () {
      document.getElementById("importFile").click();
    });

    var resetBtn = el("button", { type: "button", class: "btn btn--danger btn--block", text: "重置为默认配置（清除已保存）" });
    resetBtn.addEventListener("click", function () {
      if (!confirm("确认重置为默认配置？当前所有修改将被清除。")) return;
      Storage.resetConfig();
      state.config = Storage.getConfig();
      renderAll();
      toast("已重置为默认", "success");
      markDirty();
    });

    var assetListWrap = el("div", {});
    function refreshAssetList() {
      clear(assetListWrap);
      Storage.listAssets().then(function (rows) {
        if (!rows.length) {
          assetListWrap.appendChild(el("div", { class: "empty-hint", text: "（暂无上传的资源）" }));
          return;
        }
        var list = el("div", { class: "repeat-list" });
        rows.forEach(function (r) {
          var row = el("div", { class: "repeat-item" }, [
            el("div", { class: "repeat-item__header" }, [
              el("span", { class: "repeat-item__title", text: (r.name || r.ref) }),
              el("div", { class: "repeat-item__actions" }, [
                el("span", { text: r.type + " · " + (r.size / 1024).toFixed(1) + "KB", style: { "font-size": "11px", color: "#888", "margin-right": "8px", "align-self": "center" } }),
                (function () {
                  var btn = el("button", { type: "button", class: "btn btn--sm btn--danger", text: "删除" });
                  btn.addEventListener("click", function () {
                    if (!confirm("删除该资源？引用它的字段会变成无效引用。")) return;
                    Storage.deleteAsset(r.ref).then(function () {
                      toast("已删除", "success");
                      refreshAssetList();
                    });
                  });
                  return btn;
                })()
              ])
            ])
          ]);
          list.appendChild(row);
        });
        assetListWrap.appendChild(list);
      });
    }
    refreshAssetList();

    return panel("高级 · 数据管理", [
      el("div", { class: "field-row" }, [
        el("label", { text: "导出配置" }),
        el("div", { class: "field-control" }, [exportBtn, el("div", { class: "field-hint", text: "下载完整 JSON 配置文件作为备份" })])
      ]),
      el("div", { class: "field-row" }, [
        el("label", { text: "导入配置" }),
        el("div", { class: "field-control" }, [importBtn, el("div", { class: "field-hint", text: "导入后将替换当前配置，记得点击「保存」生效" })])
      ]),
      el("div", { class: "field-row" }, [
        el("label", { text: "重置配置" }),
        el("div", { class: "field-control" }, [resetBtn, el("div", { class: "field-hint", text: "清除 localStorage 中的保存，恢复 config.js 中的默认值" })])
      ]),
      el("div", { class: "field-row" }, [
        el("label", { text: "已上传资源" }),
        el("div", { class: "field-control" }, [assetListWrap, el("div", { class: "field-hint", text: "存储在浏览器 IndexedDB 中的图片/视频。导出 JSON 不包含二进制本身。" })])
      ])
    ], { id: "panel-advanced" });
  }

  // ---------- Nav ----------
  function buildNav(config, sections) {
    var nav = document.getElementById("adminNav");
    clear(nav);
    var groups = [
      { title: "全局", items: [
        { href: "#panel-site", label: "站点信息" },
        { href: "#panel-profile", label: "个人介绍" }
      ]},
      { title: "作品集", items: sections.map(function (s, i) {
        return { href: "#panel-section-" + (s.id || i), label: (s.number || "") + " " + (s.title || "未命名") };
      })},
      { title: "其它", items: [
        { href: "#panel-footer", label: "页脚" },
        { href: "#panel-advanced", label: "高级 · 数据" }
      ]}
    ];
    groups.forEach(function (g) {
      nav.appendChild(el("div", { class: "nav-group-title", text: g.title }));
      g.items.forEach(function (it) {
        var a = el("a", { href: it.href, text: it.label });
        a.addEventListener("click", function () {
          Array.from(nav.querySelectorAll("a")).forEach(function (x) { x.classList.remove("is-active"); });
          a.classList.add("is-active");
        });
        nav.appendChild(a);
      });
    });
  }

  // ---------- Render all ----------
  function renderAll() {
    var main = document.getElementById("adminMain");
    clear(main);
    var config = state.config;

    main.appendChild(buildSitePanel(config.site));
    main.appendChild(buildProfilePanel(config.profile));
    (config.sections || []).forEach(function (section, idx) {
      main.appendChild(buildSectionPanel(section, idx));
    });
    main.appendChild(buildFooterPanel(config.footer));
    main.appendChild(buildAdvancedPanel());

    buildNav(config, config.sections || []);

    // Section list add/remove at top level
    // We'll also append a "section manager" panel at the bottom of the sections area
    // (already handled via buildAdvancedPanel for assets; for sections we add a small manager)
    // Actually the simplest is to add "+ 添加作品集 section" button at the end of sections area.
    // For brevity, that's handled below.
    var sectionAddPanel = panel("作品集管理", [
      el("div", { class: "field-hint", text: "上面的卡片就是各个作品集。要添加新作品集，请点击下方按钮。" }),
      (function () {
        var btn = el("button", { type: "button", class: "btn btn--block", text: "+ 添加新作品集" });
        btn.addEventListener("click", function () {
          var newSection = {
            id: "section-" + Date.now().toString(36),
            number: String(config.sections.length + 1).padStart(2, "0"),
            title: "新作品集",
            subtitle: "Work collection",
            items: []
          };
          config.sections.push(newSection);
          markDirty();
          renderAll();
          // scroll to new section
          setTimeout(function () {
            var target = document.getElementById("panel-section-" + newSection.id);
            if (target) target.scrollIntoView({ behavior: "smooth" });
          }, 50);
        });
        return btn;
      })()
    ], { id: "panel-section-manager" });
    // insert before footer panel
    var footerPanel = document.getElementById("panel-footer");
    main.insertBefore(sectionAddPanel, footerPanel);
  }

  // ---------- Top bar actions ----------
  function bindActions() {
    document.getElementById("btnSave").addEventListener("click", function () {
      if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
      doSave(false);
    });
    document.getElementById("btnPreview").addEventListener("click", function () {
      // 先保存再预览，避免预览页读到旧配置
      if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
      doSave(true);
      window.open("index.html", "_blank");
    });
    // Ctrl+S 快捷键保存
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
        doSave(false);
      }
    });
    document.getElementById("btnExport").addEventListener("click", function () {
      var data = JSON.stringify(state.config, null, 2);
      var blob = new Blob([data], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "tianna-config-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("已导出 JSON", "success");
    });
    document.getElementById("importFile").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(reader.result);
          state.config = parsed;
          renderAll();
          markDirty();
          toast("已导入，请点击「保存」生效", "success");
        } catch (err) {
          toast("导入失败：" + (err.message || err), "error");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
    document.getElementById("btnReset").addEventListener("click", function () {
      if (!confirm("确认重置为默认配置？当前所有修改将被清除。")) return;
      Storage.resetConfig();
      state.config = Storage.getConfig();
      renderAll();
      markDirty();
      toast("已重置为默认，请点击「保存」生效", "success");
    });

    // 离开页面前自动保存（防止意外丢失修改）
    window.addEventListener("beforeunload", function () {
      if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
      if (state.dirty || state.saving) {
        try { Storage.setConfig(state.config); } catch (e) {}
      }
    });

    // 修改密码按钮
    bindPasswordChange();
  }

  // ---------- 密码认证 ----------
  // 默认密码明文：tianna2026（首次访问时自动写入哈希到云端）
  var DEFAULT_PASSWORD = "tianna2026";

  async function sha256(text) {
    var data = new TextEncoder().encode(text);
    var hashBuffer = await crypto.subtle.digest("SHA-256", data);
    var arr = Array.from(new Uint8Array(hashBuffer));
    return arr.map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function getStoredPasswordHash() {
    if (state.config && state.config.meta && state.config.meta.adminPasswordHash) {
      return state.config.meta.adminPasswordHash;
    }
    return null;
  }

  function showAuthOverlay() {
    var overlay = document.getElementById("authOverlay");
    var input = document.getElementById("authPassword");
    var btn = document.getElementById("authSubmit");
    var err = document.getElementById("authError");
    overlay.classList.add("is-visible");
    setTimeout(function () { input.focus(); }, 50);

    var attempting = false;
    async function tryAuth() {
      if (attempting) return;
      var password = input.value;
      if (!password) { err.textContent = "请输入密码"; return; }
      attempting = true;
      btn.textContent = "验证中…";
      btn.disabled = true;
      err.textContent = "";
      try {
        var inputHash = await sha256(password);
        var storedHash = getStoredPasswordHash();
        if (!storedHash) storedHash = await sha256(DEFAULT_PASSWORD);
        if (inputHash === storedHash) {
          overlay.classList.remove("is-visible");
          setTimeout(function () { overlay.style.display = "none"; }, 300);
          loadEditor();
        } else {
          err.textContent = "密码错误，请重试";
          input.value = "";
          input.focus();
        }
      } catch (e) {
        err.textContent = "验证失败：" + (e.message || e);
      } finally {
        attempting = false;
        btn.textContent = "登录";
        btn.disabled = false;
      }
    }

    btn.addEventListener("click", tryAuth);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") tryAuth();
    });
  }

  function loadEditor() {
    state.config = Storage.getConfig();
    bindActions();
    renderAll();
    updateSaveStatus();
  }

  // ---------- 修改密码 ----------
  function bindPasswordChange() {
    document.getElementById("btnPassword").addEventListener("click", async function () {
      var newPass = prompt("请输入新密码（至少 6 位）：");
      if (newPass == null) return;
      if (newPass.length < 6) { toast("密码至少 6 位", "error"); return; }
      var confirmPass = prompt("请再次输入新密码确认：");
      if (confirmPass !== newPass) { toast("两次输入不一致", "error"); return; }
      var hash = await sha256(newPass);
      if (!state.config.meta) state.config.meta = {};
      state.config.meta.adminPasswordHash = hash;
      markDirty();
      toast("密码已修改，请点击「保存」生效", "success");
    });
  }

  // ---------- Init ----------
  async function init() {
    // 先初始化 Supabase 拉取远程配置
    await Storage.init();
    state.config = Storage.getConfig();
    // 首次访问：若云端没有密码哈希，自动设置默认密码
    if (!state.config.meta) state.config.meta = {};
    if (!state.config.meta.adminPasswordHash) {
      state.config.meta.adminPasswordHash = await sha256(DEFAULT_PASSWORD);
      try { Storage.setConfig(state.config); } catch (e) {}
    }
    // 显示密码遮罩，验证通过后才加载编辑器
    showAuthOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
