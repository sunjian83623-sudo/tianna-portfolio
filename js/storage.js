/**
 * 存储层：
 *  - 配置 JSON 存 localStorage（小、可序列化）
 *  - 上传的图片/视频二进制存 IndexedDB（容量大），用 "idb://<id>" 引用
 *  - 提供 resolveSrc() 把引用解析成可直接用的 URL（Blob URL 或路径）
 */
(function (global) {
  "use strict";

  var CONFIG_KEY = "tianna_site_config_v1";
  var DB_NAME = "tianna_assets_db";
  var DB_VERSION = 1;
  var STORE_NAME = "assets";
  var dbPromise = null;
  var blobUrlCache = new Map();

  // ---------- IndexedDB ----------
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function idbPut(id, blob, meta) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put({
          id: id,
          blob: blob,
          type: blob.type,
          size: blob.size,
          name: meta && meta.name || "",
          addedAt: Date.now()
        });
        tx.oncomplete = function () { resolve(id); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readonly");
        var req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbDelete(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbAll() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readonly");
        var req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // ---------- Supabase 远程存储 ----------
  var SUPABASE_URL = (global.SUPABASE_CONFIG && global.SUPABASE_CONFIG.url) || "";
  var SUPABASE_KEY = (global.SUPABASE_CONFIG && global.SUPABASE_CONFIG.anonKey) || "";
  var supabaseClient = null;
  var REMOTE_TABLE = "portfolio_config";
  var REMOTE_ROW_ID = "current";
  var REMOTE_BUCKET = "portfolio-assets";
  var remoteReady = false;
  var remoteInitPromise = null;
  var pollTimer = null;

  function initSupabase() {
    if (remoteInitPromise) return remoteInitPromise;
    remoteInitPromise = new Promise(function (resolve) {
      if (!SUPABASE_URL || !SUPABASE_KEY || !global.supabase) {
        console.warn("[storage] Supabase 未配置或 SDK 未加载，降级到本地存储");
        resolve(false);
        return;
      }
      try {
        supabaseClient = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false }
        });
        remoteReady = true;
        console.log("[storage] Supabase 初始化成功");
        resolve(true);
      } catch (e) {
        console.warn("[storage] Supabase 初始化失败:", e);
        resolve(false);
      }
    });
    return remoteInitPromise;
  }

  // ---------- Migration ----------
  // 把保存的配置按结构迁移到最新版本；只做结构调整，不碰用户实际内容
  function migrateConfig(cfg) {
    if (!cfg || !cfg.sections) return cfg;
    // v1 → v2：把「片段展示」的 4 个视频合并为 1 个「影片展示」，保留第一个
    cfg.sections.forEach(function (sec) {
      if (!sec.items) return;
      sec.items.forEach(function (item) {
        if (item.id === "videos-01" && item.type === "video-gallery") {
          if (item.title === "片段展示") item.title = "影片展示";
          if (Array.isArray(item.videos) && item.videos.length > 1) {
            item.videos = [item.videos[0]];
          }
        }
      });
    });
    return cfg;
  }

  // ---------- Public API ----------
  var Storage = {
    /** 读取站点配置；若 localStorage 无则返回 DEFAULT_CONFIG 的深拷贝 */
    getConfig: function () {
      try {
        var raw = localStorage.getItem(CONFIG_KEY);
        if (raw) return migrateConfig(JSON.parse(raw));
      } catch (e) { console.warn("getConfig parse failed:", e); }
      return JSON.parse(JSON.stringify(global.DEFAULT_CONFIG));
    },

    /** 保存站点配置到 localStorage */
    setConfig: function (config) {
      if (!config || typeof config !== "object") throw new Error("config must be object");
      config.meta = config.meta || {};
      config.meta.lastUpdated = new Date().toISOString().slice(0, 10);
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      // 通知同源其他标签页
      try {
        global.dispatchEvent(new StorageEvent("storage", { key: CONFIG_KEY }));
      } catch (e) {}
      // fire-and-forget 推送到 Supabase
      if (remoteReady) this.setConfigAsync(config);
      return config;
    },

    /** 异步保存配置到 Supabase */
    setConfigAsync: function (config) {
      if (!remoteReady) return Promise.resolve(false);
      var payload = JSON.parse(JSON.stringify(config));
      // 去掉 _resolved* 临时字段
      (function strip(o) {
        if (!o || typeof o !== "object") return;
        delete o._resolvedSrc;
        delete o._resolvedAvatar;
        delete o._resolvedPoster;
        delete o._resolvedHeroImage;
        if (Array.isArray(o)) o.forEach(strip);
        else Object.keys(o).forEach(function (k) { strip(o[k]); });
      })(payload);
      return supabaseClient.from(REMOTE_TABLE)
        .upsert({ id: REMOTE_ROW_ID, data: payload, updated_at: new Date().toISOString() })
        .then(function (resp) { return !resp.error; })
        .catch(function () { return false; });
    },

    /** 从 Supabase 强制读取最新配置 */
    getConfigAsync: function () {
      if (!remoteReady) return Promise.resolve(null);
      return supabaseClient.from(REMOTE_TABLE)
        .select("data").eq("id", REMOTE_ROW_ID).maybeSingle()
        .then(function (resp) {
          if (resp.error || !resp.data) return null;
          return migrateConfig(resp.data.data);
        })
        .catch(function () { return null; });
    },

    /** 启动时调用：从 Supabase 拉取配置覆盖本地缓存 */
    init: function () {
      var self = this;
      return initSupabase().then(function (ok) {
        if (!ok) return null;
        return self.getConfigAsync().then(function (cfg) {
          if (cfg) {
            try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch (e) {}
          }
          return cfg;
        });
      });
    },

    /** 启动远程轮询，让访客页面感知管理员更新 */
    startRemotePolling: function (onUpdate, intervalMs) {
      var self = this;
      intervalMs = intervalMs || 30000;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(function () {
        self.getConfigAsync().then(function (cfg) {
          if (cfg) {
            try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch (e) {}
            onUpdate(cfg);
          }
        });
      }, intervalMs);
    },

    /** 判断远程是否可用 */
    isRemoteReady: function () { return remoteReady; },

    /** 重置为默认配置 */
    resetConfig: function () {
      localStorage.removeItem(CONFIG_KEY);
      return this.getConfig();
    },

    /** 是否存在已保存配置 */
    hasSavedConfig: function () {
      return localStorage.getItem(CONFIG_KEY) !== null;
    },

    /**
     * 保存上传的文件：
     *  - Supabase 可用时：上传到 Storage，返回公开 URL
     *  - 降级：存 IndexedDB，返回 "idb://<id>" 引用
     */
    saveAsset: function (file) {
      var self = this;
      if (remoteReady) {
        var ext = (file.name && file.name.match(/\.[^.]+$/)) || "";
        var path = "assets/" + Date.now().toString(36) + "_" +
                   Math.random().toString(36).slice(2, 8) + ext;
        return supabaseClient.storage.from(REMOTE_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false })
          .then(function (resp) {
            if (resp.error) throw resp.error;
            return supabaseClient.storage.from(REMOTE_BUCKET)
              .getPublicUrl(path).data.publicUrl;
          })
          .catch(function (err) {
            console.warn("[storage] 远程上传失败，降级到 IndexedDB:", err);
            return self._saveAssetLocal(file);
          });
      }
      return self._saveAssetLocal(file);
    },

    /** 本地存储降级方案 */
    _saveAssetLocal: function (file) {
      var id = "a_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      return idbPut(id, file, { name: file.name }).then(function () {
        return "idb://" + id;
      });
    },

    /**
     * 删除 IndexedDB 中的资源
     */
    deleteAsset: function (ref) {
      var id = parseIdbRef(ref);
      if (id) return idbDelete(id);
      return Promise.resolve();
    },

    /**
     * 列出所有 IndexedDB 资源（用于管理界面展示）
     */
    listAssets: function () {
      return idbAll().then(function (rows) {
        return rows.map(function (r) {
          return {
            ref: "idb://" + r.id,
            type: r.type,
            size: r.size,
            name: r.name,
            addedAt: r.addedAt
          };
        });
      });
    },

    /**
     * 把配置中的 src 引用解析成可直接用于 <img>/<video> 的 URL
     *  - 普通字符串：原样返回
     *  - "idb://xxx"：异步查 IndexedDB 转 Blob URL（缓存）
     * 返回 Promise<string|null>
     */
    resolveSrc: function (src) {
      if (!src) return Promise.resolve(null);
      if (typeof src !== "string") return Promise.resolve(null);
      var id = parseIdbRef(src);
      if (!id) return Promise.resolve(src);

      if (blobUrlCache.has(id)) return Promise.resolve(blobUrlCache.get(id));
      return idbGet(id).then(function (record) {
        if (!record || !record.blob) return null;
        var url = URL.createObjectURL(record.blob);
        blobUrlCache.set(id, url);
        return url;
      });
    },

    /**
     * 批量解析（递归遍历配置对象，把所有含 src 字段的对象转为带 _resolvedSrc 的副本）
     * 主要给站点渲染使用
     */
    resolveConfig: function (config) {
      var self = this;
      var tasks = [];

      function walk(obj) {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) { obj.forEach(walk); return; }
        if (typeof obj.src === "string" && obj.src.indexOf("idb://") === 0) {
          tasks.push(self.resolveSrc(obj.src).then(function (url) {
            obj._resolvedSrc = url;
          }));
        }
        if (typeof obj.avatar === "string" && obj.avatar.indexOf("idb://") === 0) {
          tasks.push(self.resolveSrc(obj.avatar).then(function (url) {
            obj._resolvedAvatar = url;
          }));
        }
        if (typeof obj.poster === "string" && obj.poster.indexOf("idb://") === 0) {
          tasks.push(self.resolveSrc(obj.poster).then(function (url) {
            obj._resolvedPoster = url;
          }));
        }
        if (typeof obj.heroImage === "string" && obj.heroImage.indexOf("idb://") === 0) {
          tasks.push(self.resolveSrc(obj.heroImage).then(function (url) {
            obj._resolvedHeroImage = url;
          }));
        }
        Object.keys(obj).forEach(function (k) {
          var v = obj[k];
          if (v && typeof v === "object") walk(v);
        });
      }
      walk(config);
      return Promise.all(tasks).then(function () { return config; });
    },

    parseIdbRef: parseIdbRef
  };

  function parseIdbRef(ref) {
    if (typeof ref !== "string") return null;
    var m = ref.match(/^idb:\/\/(.+)$/);
    return m ? m[1] : null;
  }

  global.Storage = Storage;
})(window);
