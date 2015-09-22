(function() {
    
    if (navigator.userAgent.match(/MQQBrowser/)) {
        Backbone.emulateHTTP = true;
    }
    
    if (navigator.userAgent.match(/IEMobile\/10\.0/)) {
        var msViewportStyle = document.createElement("style");
        msViewportStyle.appendChild(
            document.createTextNode(
                "@-ms-viewport{width:auto!important}"
            )
        );
        document.getElementsByTagName("head")[0].appendChild(msViewportStyle);
    }
    
    if (!window.location.origin) {
        window.location.origin = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port: '');
    }
    
    /*
     * Amour
     */
    
    var Amour = window.Amour = {
        version: '1.0',
        APIRoot: $('meta[name="APIRoot"]').attr('content'),
        StaticURL: $('meta[name="StaticURL"]').attr('content')
    };

    (function initFastclick() {
        var fastclick = new FastClick(document.body);
        $('body').on('focus', 'textarea', function() {
            if (fastclick != null) {
                fastclick.destroy();
                fastclick = null;
            }
        });
        $('body').on('blur', 'textarea', function() {
            if (fastclick == null) {
                fastclick = new FastClick(document.body);
            }
        });
    })();

    if (!$.support.cors) {
        Amour.APIRoot = '/api/';
    }

    /*
     * Devices
     */

    Amour.isWeixin = /MicroMessenger/i.test(navigator.userAgent);
    Amour.isMobile = /iPhone|Android|iPad|Windows Phone/i.test(navigator.userAgent);
    (function initHybridApp() {
        Amour.isHybrid = false;
        var checkHybrid = function() {
            Amour.isHybrid = typeof webkit != 'undefined' && 
                             typeof webkit.messageHandlers != 'undefined';
        };
        document.addEventListener("hybriddeviceready", checkHybrid, false);
        checkHybrid();
        // if (window.hybriddeviceready) checkHybrid();
        Amour.postHybridMessage = function(name, message) {
            if (!Amour.isHybrid) return;
            var handler = window.webkit.messageHandlers[name];
            handler && handler.postMessage(message);
        };
    })();
    
    /*
     * Events and Routers
     */
    
    // Allow the `Amour` object to serve as a global event bus
    _.extend(Amour, Backbone.Events);
    
    var EventAggregator = Amour.EventAggregator = (function() {
        var EA = function() {};
        EA.extend = Backbone.Model.extend;
        _.extend(EA.prototype, Backbone.Events);
        return EA;
    })();
    
    /*
     * Models and Views
     */
    
    if (window.Handlebars) {
        Amour.TPL = Handlebars;
        Handlebars.render = function(template, attrs) {
            var template = template || '';
            var attrs = attrs || {};
            var compiledTemplate = Handlebars.compile(template);
            return compiledTemplate(attrs);
        }
        Handlebars.registerHelper('eq', function(a, b, options) {
            return a == b ? options.fn(this) : options.inverse(this);
        });
        Handlebars.registerHelper('list', function(context, options) {
            if (!Handlebars.Utils.isEmpty(context)) {
                var context = (typeof context === 'object') ? context : [context];
                return Handlebars.helpers.each.call(this, context, options);
            } else {
                return options.inverse(this);
            }
        });
    } else if (window.Mustache) {
        Amour.TPL = Mustache;
    } else {
        Amour.TPL = {
            render: function(template, attrs) { return template; }
        };
    }
    var TPL = Amour.TPL;
    
    var Model = Amour.Model = Backbone.Model.extend({
        initialize: function(attributes, options) {
            options = options || {};
            if (this.initModel) this.initModel(options);
        },
        url: function() {
            var origUrl = Backbone.Model.prototype.url.call(this);
            return origUrl + (origUrl.charAt(origUrl.length - 1) == '/' ? '' : '/');
        }
    });
    
    var Collection = Amour.Collection = Backbone.Collection.extend({
        model: Model,
        initialize: function(models, options) {
            options = options || {};
            if (this.initCollection) this.initCollection(options);
        },
        parse: function(response) {
            if (response.results != null) {
                this.count = response.count;
                this.previous = response.previous;
                this.next = response.next;
                return response.results;
            } else {
                return response;
            }
        },
        fetchNext: function(options) {
            var options = options || {};
            if (this.next) {
                options.url = this.next;
                this.fetch(options);
            }
        },
        fetchPrev: function(options) {
            var options = options || {};
            if (this.previous) {
                options.url = this.previous;
                this.fetch(options);
            }
        }
    });
    
    var View = Amour.View = Backbone.View.extend({
        initialize: function(options) {
            if (this.initView) this.initView(options || {});
        },
        renderTemplate: function(attrs, template) {
            var template = template || _.result(this, 'template') || '';
            var attrs = this.mixinTemplateHelpers(attrs);
            this.$el.html(TPL.render(template, attrs));
            this.$el.find('img[data-src]').addBack('img[data-src]').each(function() {
                Amour.loadImage($(this), $(this).data('src'));
            });
            this.$el.find('.img[data-bg-src]').addBack('.img[data-bg-src]').each(function() {
                Amour.loadBgImage($(this), $(this).data('bg-src'));
            });
            return this;
        },
        mixinTemplateHelpers: function(target){
            var target = target || {};
            return _.extend(target, _.result(this, 'templateHelpers'));
        }
    });
    
    var ModelView = Amour.ModelView = View.extend({
        listenToModel: function() {
            this.listenTo(this.model, 'change', this.render);
            this.listenTo(this.model, 'hide', this.hide);
        },
        initView: function(options) {
            this.model = this.model || new Model();
            this.listenToModel();
            if (this.initModelView) this.initModelView(options || {});
        },
        setModel: function(model) {
            this.stopListening(this.model);
            this.model = model;
            this.listenToModel();
        },
        hide: function() {
            this.remove();
        },
        serializeData: function() {
            return this.model ? this.model.toJSON() : {};
        },
        render: function() {
            return this.renderTemplate(this.serializeData());
        }
    });
    
    var CollectionView = Amour.CollectionView = View.extend({
        ModelView: ModelView,
        listenToCollection: function() {
            this.listenTo(this.collection, 'reset', this.addAll);
            this.listenTo(this.collection, 'add', this.addOne);
            this.listenTo(this.collection, 'remove', this.removeOne);
        },
        initView: function(options) {
            options = options || {};
            this.reverse = (options.reverse === true);
            this.collection = this.collection || new Collection();
            this.listenToCollection();
            if (this.initCollectionView) this.initCollectionView(options);
        },
        setCollection: function(collection) {
            this.stopListening(this.collection);
            this.collection = collection;
            this.listenToCollection();
        },
        renderItem: function(item) {
            var modelView = new this.ModelView({model: item});
            return modelView.render().el;
        },
        removeOne: function(item) {
            item.trigger('hide');
        },
        addOne: function(item) {
            var method = this.reverse ? 'prepend' : 'append';
            this.$el[method](this.renderItem(item));
        },
        addAll: function(_collection, options) {
            if (options && options.previousModels) {
                _.each(options.previousModels, function(model) {
                    model.trigger('hide');
                });
            }
            if (this.collection) {
                var nodelist = this.collection.reduce(function(nodelist, item) {
                    return nodelist.concat(this.renderItem(item));
                }, [], this);
                this.$el.html(this.reverse ? nodelist.reverse() : nodelist);
            }
        },
        render: function() {
            this.addAll();
            return this;
        }
    });
    
    /*
     * Utility Functions
     */
    
    Amour.storage = new function() {
        this.set = function(key, val) { localStorage.setItem(key, val); };
        this.get = function(key) { return localStorage.getItem(key); };
        this.del = function(key) { localStorage.removeItem(key); };
        try {
            localStorage.setItem('TEST_LOCALSTORAGE', 1);
        } catch (e) {
            alert('您的浏览器可能开启了“无痕(Private)浏览”，可能需要多次输入用户名和密码以保持登录状态');
            this.vault = {};
            this.set = function(key, val) { this.vault[key] = val; };
            this.get = function(key) { return this.vault[key]; };
            this.del = function(key) { this.vault[key] = null; };
        }
    };
    
    Amour.openWindow = function(link) {
        window.open(link, '_self', 'location=no');
    };
    
    Amour.optimizeImage = function(fullpath) {
        if (/\?imageMogr2\/|\?imageView2\//.test(fullpath)) {
            return fullpath;
        }
        var optimQuery = {
            wechat: '?imageView2/2/w/960/q/85/format/JPG',
            small: '?imageView2/2/w/640/q/85',
            large: '?imageView2/2/w/1280/q/85'
        }
        var optimpath = fullpath;
        if (/^http:\/\/up\.img\.8yinhe\.cn\/wechat\//.test(fullpath)) {
            optimpath += optimQuery.wechat;
        } else if (/^http:\/\/up\.img\.8yinhe\.cn\//.test(fullpath)) {
            optimpath += Amour.isMobile ? optimQuery.small : optimQuery.large;
        }
        return optimpath;
    };
    
    Amour.imageFullpath = function(src, options) {
        options = options || {};
        var fullpath = /^http:\/\//.test(src) ? src : Amour.StaticURL + src;
        return options.optimize === false ? fullpath: Amour.optimizeImage(fullpath);
    };
    
    Amour.loadImage = function(img, src, options) {
        options = options || {};
        if (!src) {
            options.error && options.error();
            return;
        }
        var image = new Image(), image_src = Amour.imageFullpath(src, options);
        image.onload = function() {
            img.attr('src', image_src);
            options.success && options.success();
        };
        image.onerror = function() {
            img.attr('src', null);
            options.error && options.error();
        };
        image.src = image_src;
    };
    
    Amour.loadBgImage = function(el, src, options) {
        options = options || {};
        if (!src) {
            options.error && options.error();
            return;
        }
        var image = new Image(), image_src = Amour.imageFullpath(src, options);
        image.onload = function() {
            el.removeClass('img-loading');
            el.css('background-image', 'url(' + image_src + ')');
            options.success && options.success();
        };
        image.onerror = function() {
            el.removeClass('img-loading').addClass('img-broken');
            //el.css('background-image', null);
            options.error && options.error();
        };
        el.addClass('img-loading');
        image.src = image_src;
    };
    
    Amour.fillImages = function() {
        var count = 1 + $('img[data-src]').length + $('.img[data-bg-src]').length;
        var imageLoad = _.after(count, function() {
            Amour.imagesLoaded = true;
            Amour.trigger('ImagesLoaded');
        });
        imageLoad();
        $('img[data-src]').each(function() {
            var src = $(this).data('src');
            Amour.loadImage($(this), src, {
                success: imageLoad, error: imageLoad
            });
        });
        $('.img[data-bg-src]').each(function() {
            var src = $(this).data('bg-src');
            Amour.loadBgImage($(this), src, {
                success: imageLoad, error: imageLoad
            });
        });
    };
    
    /*
     * Models and Collections API
     */
    
    Amour.Models = {};
    Amour.Collections = {};
    
    var dataMixins = Amour.dataMixins = {
        getData: function(key, root) {
            var data = root || this.get('data');
            if (key == null) {
                return data;
            } else if (!_.isString(key) || !_.isObject(data)) {
                return null;
            } else {
                var i = key.indexOf('.');
                if (i > 0) {
                    var d = data[key.substr(0, i)];
                    return (d == null) ? null : this.getData(key.substr(i+1), d);
                } else {
                    return data[key];
                }
            }
        },
        setData: function(key, value, root) {
            if (!root) {
                if (!_.isObject(this.attributes.data)) this.attributes.data = {};
                root = this.attributes.data;
            }
            if (_.isObject(key)) {
                _.extend(root, key);
            } else if (_.isString(key)) {
                var i = key.indexOf('.');
                if (i > 0) {
                    var k = key.substr(0, i);
                    var k2 = key.substr(i+1);
                    if (root[k] == null) {
                        root[k] = _.isFinite(k2.split('.')[0]) ? [] : {};
                    }
                    this.setData(k2, value, root[k]);
                } else {
                    root[key] = value;
                }
            }
        }
    };
    
    Amour.Models.StoryEvent = Amour.Model.extend({
        urlRoot: Amour.APIRoot + 'sites/storyevent/'
    }).extend(dataMixins);
    
    Amour.Collections.StoryEvents = Amour.Collection.extend({
        url: Amour.APIRoot + 'sites/storyevent/',
        model: Amour.Models.StoryEvent
    });
    
    Amour.Models.Story = Amour.Model.extend({
        urlRoot: Amour.APIRoot + 'sites/story/',
        initModel: function() {
            this.storyEvents = new Amour.Collections.StoryEvents(this.get('storyEvents'));
            this.on('change:storyEvents', function() {
                this.storyEvents.set(this.get('storyEvents'));
            }, this);
        },
        getStoryEvent: function(name) {
            return this.storyEvents.findWhere({name: name});
        },
        getStoryEventData: function(name, key) {
            var storyEvent = this.getStoryEvent(name);
            return storyEvent ? storyEvent.getData(key) : null;
        },
        updateStoryEvent: function(name, updates) {
            var storyEvent = this.storyEvents.findWhere({name: name});
            storyEvent.setData(updates);
            storyEvent.save();
        }
    }).extend(dataMixins);
    
    Amour.Collections.Stories = Amour.Collection.extend({
        url: Amour.APIRoot + 'sites/story/',
        model: Amour.Models.Story
    });
    
    Amour.Models.Section = Amour.Model.extend({
        urlRoot: null
    }).extend(dataMixins);
    
    Amour.Collections.Sections = Amour.Collection.extend({
        url: null,
        model: Amour.Models.StoryEvent
    });
    
    Amour.Models.Schema = Amour.Model.extend({
        idAttribute: 'name',
        urlRoot: Amour.APIRoot + 'sites/schema/',
        initModel: function() {
            this.sections = new Amour.Collections.Sections(this.get('sections'));
            this.on('change:sections', function() {
                this.sections.set(this.get('sections'));
            }, this);
        },
        getSection: function(name) {
            return this.sections.findWhere({name: name});
        }
    }).extend(dataMixins);
    
    Amour.Collections.Schemas = Amour.Collection.extend({
        url: Amour.APIRoot + 'sites/schema/',
        model: Amour.Models.Schema
    });
    
    Amour.Models.User = Amour.Model.extend({
        urlRoot: Amour.APIRoot + 'users/user/',
        initModel: function() {
            this.profile = new (Amour.Model.extend({
                urlRoot: Amour.APIRoot + 'users/profile/',
            }))(this.get('profile'));
            this.on('change:profile', function() {
                this.profile.set(this.get('profile'));
            }, this);
        },
        parse: function(response) {
            return _.isArray(response) ? response[0] : response;
        },
        change_password: function(password, options) {
            options = options || {};
            options.url = Amour.APIRoot + 'users/user/change_password/';
            options.patch = true;
            this.save({
                password: password
            }, options);
        },
        login: function(auth, options) {
            this.clear().set(auth);
            options = options || {};
            options.url = Amour.APIRoot + 'api-token-auth/';
            var success = options.success;
            options.success = function(model, response, options) {
                Amour.TokenAuth.set(response.token);
                if (success) success(model, response, options);
                model.trigger('login');
            };
            this.save({}, options);
        },
        register: function(auth, options) {
            this.clear().set(auth);
            var success = options.success;
            options.success = function(model, response, options) {
                if (success) success(model, response, options);
            };
            this.save({}, options);
        }
    });
    
    /*
     * Initializations
     */
    
    var initSync = function () {
        var authToken = Amour.storage.get('auth-token');
        var originalSync = Backbone.sync;
        Backbone.sync = function (method, model, options) {
            _.extend((options.headers || (options.headers = {})), { 'Accept-Language': 'zh-CN' });
            if (authToken) {
                // _.extend((options.headers || (options.headers = {})), { 'Authorization': 'Token ' + authToken });
                _.extend(options.headers, { 'Authorization': 'Token ' + authToken });
            }
            return originalSync.call(model, method, model, options);
        };
        Amour.TokenAuth = {
            get: function () {
                return _.clone(authToken);
            },
            set: function (token) {
                authToken = _.clone(token);
                Amour.storage.set('auth-token', authToken);
            },
            clear: function () {
                authToken = null;
                Amour.storage.del('auth-token');
            }
        };
    };
    
    var initAjaxEvents = function () {
        _.extend((Amour.ajax = {}), Backbone.Events);
        $(document).ajaxStart(function () {
            Amour.ajax.trigger('start');
        });
        $(document).ajaxStop(function () {
            Amour.ajax.trigger('stop');
        });
        $(document).ajaxError(function (event, jqxhr, settings, exception) {
            var response = jqxhr.responseJSON || {};
            if (jqxhr.status == 401 || jqxhr.status == 499) {
                Amour.TokenAuth.clear();
                Amour.ajax.trigger('unauthorized');
            } else if (jqxhr.status == 403) {
                Amour.TokenAuth.clear();
                Amour.ajax.trigger('forbidden');
            } else if (settings.type == 'GET' && jqxhr.statusText != 'abort') {
                Amour.ajax.trigger('error');
            }
        });
    };
    
    var initErrorReporting = function() {
        if (window['amour-disable-error-reporting']) return;
        var ClientError = Amour.Model.extend({
            urlRoot: Amour.APIRoot + 'clients/error/' 
        });
        window.onerror = function(message) {
            try {
                var error = new ClientError();
                error.save({
                    message: message,
                    detail: {
                        url: location.href,
                        error: arguments,
                        userAgent: navigator.userAgent
                    }
                }, {global: false});
            } catch (e) {}
        };
    };
    
    if (!window['amour-lazy-loading-images']) {
        Amour.fillImages();
    }
    
    /* 
     * Export
     */
    initSync();
    initAjaxEvents();
    initErrorReporting();
    
})();
