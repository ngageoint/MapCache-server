var angular = require('angular');
var turf = require('turf');
var _ = require('underscore');
var xyzTileUtils = require('xyz-tile-utils');

var MapcacheCreateController = function($scope, $location, $http, $routeParams, $modal, $rootScope, ServerService, CacheService, MapService, LocalStorageService) {
  this.MapService = MapService;
  this.ServerService = ServerService;
  this.CacheService = CacheService;
  this.$location = $location;
  this.$scope = $scope;

  $scope.create = this;
  // $scope.$watch('create.cache.geometry', this._cacheGeometryWatch.bind(this));
  $scope.$on('draw:drawstart', this._boundariesDrawn.bind(this));
  $scope.$on('draw:created', this._boundariesDrawn.bind(this));
  $scope.$on('draw:edited', this._boundariesDrawn.bind(this));

  $scope.$watch('create.cache.geometry', this._boundariesDrawn.bind(this, undefined));
  $scope.$watch('create.cache.source', this._cacheSourceWatch.bind(this));
  $scope.$watch('create.cache.source.previewLayer', this._layerWatch.bind(this));
  $scope.$watch('create.cache.create', this._cacheCreateWatch.bind(this), true);
  $scope.$watch('create.cache.minZoom+create.cache.maxZoom+create.tileCacheRequested', this._calculateCacheSize.bind(this));

  $rootScope.title = 'Create A Cache';
  this.token = LocalStorageService.getToken();

  this.mapId = $routeParams.mapId;
  this.cache = {
    format: "xyz",
    permission: 'MAPCACHE',
    create: {}
  };

  this.bb = {};
  this.north = {};
  this.south = {};
  this.west = {};
  this.east = {};

  var defaultStyle = {
    'fill': "#000000",
    'fill-opacity': 0.5,
    'stroke': "#0000FF",
    'stroke-opacity': 1.0,
    'stroke-width': 1
  };
  this.featureProperties = [];
  this.newRule = {
    style: angular.copy(defaultStyle)
  };

  this.sizes = [{
    label: 'MB',
    multiplier: 1024*1024
  },{
    label: 'GB',
    multiplier: 1024*1024*1024
  }];

  this.cache.selectedSizeMultiplier = this.sizes[0];
  this.loadingMaps = true;
  this.boundsSet = false;

  this.initialize();
};

MapcacheCreateController.prototype.initialize = function () {
  if (this.mapId) {
    this.MapService.getMap({id:this.mapId}, function(map) {
      this.cache.source = map;
      this.cache.permission = map.permission;
      this.loadingMaps = false;
    }.bind(this));
  } else {
    this.MapService.getAllMaps(true).then(function(maps) {
      this.loadingMaps = false;
      this.maps = maps;
    }.bind(this), function() {
      this.loadingMaps = false;
    }.bind(this));
  }
  this.ServerService.getMaxCacheSize(function(data) {
    this.storage = data;
  }.bind(this));
};

MapcacheCreateController.prototype.useCurrentView = function() {
  this.cache.useCurrentView = Date.now();
};

MapcacheCreateController.prototype.dmsChange = function(direction, dms) {
  console.log('dms', dms);
  this.bb[direction] = (!isNaN(dms.degrees) ? Number(dms.degrees) : 0) + (!isNaN(dms.minutes) ? dms.minutes/60 : 0) + (!isNaN(dms.seconds) ? dms.seconds/(60*60) : 0);
  this.manualEntry();
};

MapcacheCreateController.prototype.manualEntry = function() {
  var directionsSet = 0;
  if(!isNaN(parseFloat(this.bb.north))) {
    this._setDirectionDMS(this.bb.north, this.north);
    directionsSet++;
  }
  if(!isNaN(parseFloat(this.bb.south))) {
    this._setDirectionDMS(this.bb.south, this.south);
    directionsSet++;
  }
  if(!isNaN(parseFloat(this.bb.east))) {
    this._setDirectionDMS(this.bb.east, this.east);
    directionsSet++;
  }
  if(!isNaN(parseFloat(this.bb.west))) {
    this._setDirectionDMS(this.bb.west, this.west);
    directionsSet++;
  }

  if (parseFloat(this.bb.east) <= parseFloat(this.bb.west) || parseFloat(this.bb.north) <= parseFloat(this.bb.south)) {
    this.boundsSet = false;
    this.ewError = parseFloat(this.bb.east) <= parseFloat(this.bb.west);
    this.nsError = parseFloat(this.bb.north) <= parseFloat(this.bb.south);
    this.$scope.$broadcast('extentChanged', null);
    return true;
  }
  this.ewError = false;
  this.nsError = false;

  if (directionsSet !== 4) {
    this.boundsSet = false;
    this.$scope.$broadcast('extentChanged', null);
    return true;
  }

  this.boundsSet = true;
  var envelope = {
    north: parseFloat(this.bb.north),
    south: parseFloat(this.bb.south),
    west: parseFloat(this.bb.west),
    east: parseFloat(this.bb.east)
  };
  this.cache.geometry = turf.bboxPolygon([envelope.west, envelope.south, envelope.east, envelope.north]);
  this.$scope.$broadcast('extentChanged', envelope);
  this._calculateCacheSize();
};

MapcacheCreateController.prototype._setDirectionDMS = function(dd, direction) {
  var deg = parseFloat(dd);
  if (!deg) return;

  var absDeg = Math.abs(deg);
  var multiplier = deg < 0 ? -1 : 1;

 var d = Math.floor(absDeg);
 var minfloat = (absDeg-d)*60;
 var m = Math.floor(minfloat);
 var secfloat = (minfloat-m)*60;
 var s = Math.round(secfloat);
 if (s === 60) {
   s = 0;
   m = m + 1;
 }
 direction.degrees = d * multiplier;
 direction.minutes = m;
 direction.seconds = s;
};

MapcacheCreateController.prototype.toggleDataSource = function(id, ds) {
  if (this.selectedDatasources[id]) {
    this.cache.currentDatasources.push(ds);
  } else {
    this.cache.currentDatasources = _.without(this.cache.currentDatasources, ds);
  }
};

MapcacheCreateController.prototype.requiredFieldsSet = function() {
  this.unsetFields = [];

  if (!this.cache.source) {
    this.unsetFields.push('cache map');
    return false;
  }

  if (!this.cache.name) {
    this.unsetFields.push('cache name');
  }

  var zoomValidated = false;
  if (!this.tileCacheRequested) {
    zoomValidated = true;
  } else {
    if (isNaN(this.cache.minZoom) || isNaN(this.cache.maxZoom) || this.cache.maxZoom === null || this.cache.minZoom === null) {
      zoomValidated = false;
    } else if ((this.cache.minZoom === 0 && this.cache.maxZoom === 0) ||
    (this.cache.minZoom === 0 && this.cache.maxZoom > 0) ||
    (this.cache.maxZoom >= this.cache.minZoom)) {
      zoomValidated = true;
    }
  }

  var cacheTypeSet = false;
  for (var type in this.cache.create) {
    if (this.cache.create[type] === true) {
      cacheTypeSet = true;
    }
  }

  if (!cacheTypeSet) {
    this.unsetFields.push('type of cache to create');
  }

  if (!zoomValidated) {
    this.unsetFields.push('zoom levels');
  }
  if (!this.boundsSet) {
    this.unsetFields.push('cache boundaries');
  }

  if (!_.some(_.values(this.cache.currentDatasources), function(value) {
    return value;
  })) {
    this.unsetFields.push('at least one data source');
  }

  if (this.cache.source.format === 'wms' && !this.cache.source.previewLayer) {
    this.unsetFields.push('WMS layer');
    return false;
  }

  return !!this.cache.geometry && !!this.boundsSet && !!this.cache.name && !!this.cache.source && !!zoomValidated;
};

MapcacheCreateController.prototype.createCache = function() {
  if (this.cache.rawTileSizeLimit) {
    this.cache.tileSizeLimit = this.cache.rawTileSizeLimit * this.cache.selectedSizeMultiplier.multiplier;
  }
  this.creatingCache = true;
  this.cacheCreationError = null;
  this.cache.cacheCreationParams = {
    dataSources: []
  };
  _.each(this.cache.currentDatasources, function(ds) {
    this.cache.cacheCreationParams.dataSources.push(ds.id);
  }.bind(this));
  var create = [];
  for (var type in this.cache.create) {
    if (this.cache.create[type]) {
      create.push(type);
    }
  }
  this.cache.create = create;
  this.CacheService.createCache(this.cache, function(cache) {
    this.creatingCache = false;
    this.$location.path('/cache/'+cache.id);
  }.bind(this), function(error, status) {
    this.creatingCache = false;
    this.cacheCreationError = {error: error, status: status};
  }.bind(this));
};

MapcacheCreateController.prototype.createMap = function() {
  this.$location.path('/map');
};

MapcacheCreateController.prototype._calculateCacheSize = function() {
  if (!this.tileCacheRequested || !this.cache.source || isNaN(this.cache.minZoom) || isNaN(this.cache.maxZoom) || !this.cache.geometry) {
    this.totalCacheSize = 0;
    this.totalCacheTiles = 0;
    return;
  }

  var extent = turf.extent(this.cache.geometry);
  this.totalCacheTiles = xyzTileUtils.tileCountInExtent(extent, this.cache.minZoom, this.cache.maxZoom);
  this.totalCacheSize = this.totalCacheTiles * (this.cache.source.tileSize/this.cache.source.tileSizeCount);
};

MapcacheCreateController.prototype._boundariesDrawn = function(event, geometry) {
  if (!geometry) {
    this.bb.north = null;
    this.bb.south = null;
    this.bb.west = null;
    this.bb.east = null;
    this.north = {};
    this.south = {};
    this.west = {};
    this.east = {};
    this.boundsSet = false;
    return;
  }
  this.boundsSet = true;
  var extent = turf.extent(geometry);
  this.bb.north = extent[3];
  this._setDirectionDMS(this.bb.north, this.north);
  this.bb.south = extent[1];
  this._setDirectionDMS(this.bb.south, this.south);
  this.bb.west = extent[0];
  this._setDirectionDMS(this.bb.west, this.west);
  this.bb.east = extent[2];
  this._setDirectionDMS(this.bb.east, this.east);

  this.cache.geometry = geometry;

  this._calculateCacheSize();
};

MapcacheCreateController.prototype._cacheSourceWatch = function(map) {
  if (!map) return;
  this.selectedDatasources = {};
  this.cache.currentDatasources = map.dataSources;
  _.each(map.dataSources, function(ds) {
    this.selectedDatasources[ds.id] = true;
  }.bind(this));
  this.cache.create = {};
  if (this.cache.source) {
    this.cache.style = this.cache.source.style;
    this.cache.permission = this.cache.source.permission;
    for (var i = 0; i < this.cache.source.cacheTypes.length; i++) {
      var type = this.cache.source.cacheTypes[i];
      this.cache.create[type.type] = type.required;
    }
    this.requiredFieldsSet();
  }

  if (!map || !map.geometry) {
    this.bb.north = null;
    this.bb.south = null;
    this.bb.west = null;
    this.bb.east = null;
    this.cache.geometry = null;
  }

  this.hasVectorSources = _.some(map.dataSources, function(ds) {
    return ds.vector;
  });
};

MapcacheCreateController.prototype._cacheCreateWatch = function() {
  if (!this.cache.create) return;
  var tileCacheRequested = false;
  for (var key in this.cache.create) {
    if (this.cache.create[key] === true) {
      for (var i = 0; i < this.cache.source.cacheTypes.length && !tileCacheRequested; i++) {
        if (this.cache.source.cacheTypes[i].type === key && !this.cache.source.cacheTypes[i].vector) {
          tileCacheRequested = true;
        }
      }
    }
  }
  this.tileCacheRequested = tileCacheRequested;
};

MapcacheCreateController.prototype._layerWatch = function(layer) {
  if (layer) {
    if (layer.EX_GeographicBoundingBox) { // jshint ignore:line
      this.cache.extent = layer.EX_GeographicBoundingBox; // jshint ignore:line
    }
  }
};

module.exports = MapcacheCreateController;
