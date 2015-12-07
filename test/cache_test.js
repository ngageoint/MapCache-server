var log = require('mapcache-log')
  , fs = require('fs-extra')
  , Cache = require('../cache/cache')
  , path = require('path')
  , FeatureModel = require('mapcache-models').Feature
  , turf = require('turf')
  , async = require('async')
  , should = require('should');

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function toHex(d) {
    return  ("0"+(Number(d).toString(16))).slice(-2).toUpperCase()
}

function getRandomColor() {
  return '#' + toHex(getRandomInt(0, 256)) + toHex(getRandomInt(0, 256)) + toHex(getRandomInt(0, 256));
}

function getRandomStyle() {
  return {
    'fill': getRandomColor(),
    'fill-opacity': 0.5,
    'stroke': getRandomColor(),
    'stroke-opacity': 0.5,
    'stroke-width': 1
  }
}

describe('Cache Tests', function() {

  var cacheDir = '/tmp/cache_test';
  var cache;

  var osm = {
    id: 'osm-ds',
    name: 'osm',
    url: 'http://osm.geointapps.org/osm',
    format: 'xyz',
    zOrder: 0
  };

  var rivers = {
    id: 'rivers-ds',
    name: 'rivers',
    file: {
      path: path.join(__dirname, 'format','Rivers.geojson'),
      name: 'Rivers.geojson'
    },
    format: 'geojson',
    zOrder: 2,
    style: {
      defaultStyle: {
        style: getRandomStyle()
      }
    }
  };

  var landHexes = {
    id: 'landhexes-ds',
    name: 'landhexes',
    file: {
      path: '/data/maps/landhexes.json',
      name: 'landhexes'
    },
    format: 'geojson',
    zOrder: 1,
    style: {
      defaultStyle: {
        style: getRandomStyle()
      }
    }
  };

  var map = {
    outputDirectory: cacheDir,
    id: 'test-map',
    name: 'test-map',
    dataSources: [osm, rivers, landHexes]
  };

  var cacheModel = {
    source: map,
    outputDirectory: cacheDir,
    id: 'cache-test',
    name: 'cache-test',
    minZoom: 0,
    maxZoom: 3,
    geometry: turf.polygon([[
      [-180, -85],
      [-180, 85],
      [180, 85],
      [180, -85],
      [-180, -85]
    ]]),
    cacheCreationParams: {
      noGeoPackageIndex: true
    }
  };

  before(function(done) {
    this.timeout(0);
    async.eachSeries([rivers], function(source, callback) {
      FeatureModel.deleteFeaturesBySourceId(source.id, function(count) {
        log.info('deleted %d %s features', count, source.id);
        callback();
      });
    }, function() {
      done();
      //fs.remove(cacheDir, done);
    });
  });

  after(function(done) {
    this.timeout(0);
    done();
  });

  it('should construct a cache from all the sources', function (done) {
    this.timeout(0);
    cache = new Cache(cacheModel);
    cache.callbackWhenInitialized(function(err, newCache) {
      console.log(err);
      // log.info('Cache was initialized', JSON.stringify(newCache.cache.source.source.properties, null, 2));
      newCache.cache.source.getTile.should.be.a.Function;
      done(err);
    });
  });

  xit('should pull the 0/0/0 tile from the cache', function (done) {
    this.timeout(0);
    cache.getTile('png', 0, 0, 0, function(err, tileStream) {
      should.exist(tileStream);
      var ws = fs.createOutputStream('/tmp/cache_test.png');
      tileStream.pipe(ws);
      ws.on('finish', function() {
        done(err);
      });
    });
  });

  describe('cache creation', function() {
    after(function(done){
      log.info('copy over the leaflet page to ', path.join(cacheDir, cacheModel.id, 'index.html'));
      fs.copy(path.join(__dirname, './leaflet/index.html'), path.join(cacheDir, cacheModel.id, 'index.html'), done);
    });

    xit('should generate the XYZ format for the cache', function (done) {
      this.timeout(0);
      cache.generateFormat('xyz', function(err, cache) {
          console.log('cache finished with err?', err);
          console.log('cache completed', cache);
          done();
        },
        function(progress, callback) {
          console.log('cache progress', progress);
          callback(null, progress);
        }
      );
    });

    it('should generate the GeoPackage format for the cache', function (done) {
      this.timeout(0);
      cache.generateFormat('geopackage', function(err, cache) {
          console.log('cache finished with err?', err);
          console.log('cache completed', cache);
          done();
        },
        function(progress, callback) {
          console.log('cache progress', progress);
          callback(null, progress);
        }
      );
    });

  });

});
