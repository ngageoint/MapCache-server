var request = require('supertest')
  , mongoose = require('mongoose')
  , config = require('mapcache-config')
  , path = require('path')
  , models = require('mapcache-models')
  , TokenModel = mongoose.model('Token')
  , sinon = require('sinon')
  , Map = require('../../api/source')
  , mocks = require('../../mocks')
  , app = require('../../express');

require('sinon-mongoose');
// require('chai').should();

describe("map route tests", function() {

  var sandbox;
  before(function() {
    sandbox = sinon.sandbox.create();
    var mongodbConfig = config.server.mongodb;

    var mongoUri = "mongodb://" + mongodbConfig.host + "/" + mongodbConfig.db;
    mongoose.connect(mongoUri, {server: {poolSize: mongodbConfig.poolSize}}, function(err) {
      if (err) {
        console.log('Error connecting to mongo database, please make sure mongodb is running...');
        throw err;
      }
    });
    mongoose.set('debug', true);
  });

  after(function(done) {
    mongoose.disconnect(function() {
      done();
    });
  });

  beforeEach(function() {
    var token = {
      _id: '1',
      token: '12345',
      userId: {
        populate: function(field, callback) {
          callback(null, {
            _id: '1',
            username: 'test',
            roleId: {
              permissions: ['CREATE_CACHE', 'READ_CACHE', 'DELETE_CACHE']
            }
          });
        }
      }
    };

    sandbox.mock(TokenModel)
      .expects('findOne')
      .atLeast(0)
      .withArgs({token: "12345"})
      .chain('populate')
      .atLeast(0)
      .chain('exec')
      .atLeast(0)
      .yields(null, token);
  });

  afterEach(function() {
    sandbox.restore();
  });

  it('tests', function() {
    TokenModel.findOne({token: "12345"}, function(err, token) {
      console.log('Token', token);
    });
  });

  describe("map create tests", function() {

    var mapId;

    afterEach(function(done) {
      if (!mapId) return done();
      Map.getById(mapId, function(err, map) {
        var m = new Map(map);
        m.delete(done);
      });
    });

    it("api should create a map", function(done) {

      request(app)
        .post('/api/maps')
        .set('Accept', 'application/json')
        .set('Authorization', 'Bearer 12345')
        .expect(200)
        .expect('Content-Type', /json/)
        .send({
          dataSources: [{
            zOrder: 0,
            url: 'http://osm.geointapps.org/osm',
            format: 'xyz',
            valid: true,
            name: 'http://osm.geointapps.org/osm'
          }],
          name: 'OSM' }
        )
        .expect(function(res) {
          var source = res.body;
          mapId = source.id;
          source.should.have.property('id');
          source.should.have.property('name');
          source.should.have.property('dataSources');
          source.dataSources[0].should.have.property('id');
        })
        .end(done);
    });

    it.only('should create a map with a wms source', function(done) {
      request(app)
        .post('/api/maps')
        .set('Accept', 'application/json')
        .set('Authorization', 'Bearer 12345')
        .expect(200)
        .expect('Content-Type', /json/)
        .send({
          "dataSources":[mocks.mapMocks.wmsDatasource],
          "name": "wms"
        })
        .expect(function(res) {
          var source = res.body;
          mapId = source.id;
          source.should.have.property('id');
          source.should.have.property('name');
          source.should.have.property('dataSources');
          source.dataSources[0].should.have.property('id');
        })
        .end(done);
    });

    it("api should create a map from a file", function(done) {

      var mapJson = {
        dataSources: [{
          zOrder: 0,
          format: 'geojson',
          name: 'rivers',
          file: {
            name: 'Rivers.geojson'
          }
        }],
        name: 'Rivers'
      };

      request(app)
        .post('/api/maps')
        .set('Accept', 'application/json')
        .set('Authorization', 'Bearer 12345')
        .attach('mapFile', path.join(__dirname, '../format/Rivers.geojson'))
        .expect(200)
        .expect('Content-Type', /json/)
        .field('map', JSON.stringify(mapJson))
        .expect(function(res) {
          var source = res.body;
          mapId = source.id;
          console.log('map', source);
          source.should.have.property('id');
          source.should.have.property('name');
          source.should.have.property('dataSources');
          source.dataSources[0].should.have.property('id');
        })
        .end(done);
    });
  });

  describe("tests on existing map", function() {
    var mapId;
    var map;

    beforeEach(function(done) {
      request(app)
        .post('/api/maps')
        .set('Accept', 'application/json')
        .set('Authorization', 'Bearer 12345')
        .expect(200)
        .expect('Content-Type', /json/)
        .send({
          dataSources: [{
            zOrder: 0,
            url: 'http://osm.geointapps.org/osm',
            format: 'xyz',
            valid: true,
            name: 'http://osm.geointapps.org/osm'
          }],
          name: 'OSM' }
        )
        .expect(function(res) {
          map = res.body;
          mapId = map.id;
        })
        .end(done);
    });

    afterEach(function(done) {
      if (!mapId) return done();
      Map.getById(mapId, function(err, map) {
        var m = new Map(map);
        m.delete(done);
      });
    });

    it ('should pull all of the maps', function(done) {
      request(app)
        .get('/api/maps')
        .set('Authorization', 'Bearer 12345')
        .expect(200)
        .expect(function(res) {
          var maps = res.body;
          maps.length.should.be.greaterThan(0);
        })
        .end(done);
    });

    it ('should pull the 0/0/0 tile for the map', function(done) {
      request(app)
        .get('/api/maps/'+mapId+'/0/0/0.png')
        .set('Authorization', 'Bearer 12345')
        .expect(200)
        .end(done);
    });

    it ('should pull the 0/0/0 tile for the map with sources url', function(done) {
      request(app)
        .get('/api/sources/'+mapId+'/0/0/0.png')
        .set('Authorization', 'Bearer 12345')
        .expect(200)
        .end(done);
    });

    it ('should pull the map', function(done) {
      request(app)
        .get('/api/maps/'+mapId)
        .set('Authorization', 'Bearer 12345')
        .expect(200)
        .expect(function(res) {
          var map = res.body;
          map.should.have.property('name', 'OSM');
          map.should.have.property('status');
          map.should.have.property('id', mapId);
          map.should.have.property('mapcacheUrl', '/api/sources/'+mapId);
          map.should.have.property('dataSources');
          console.log(res.body);
        })
        .end(done);
    });

    it ('should update the map', function(done) {
      map.name = 'ChangedOSM';
      request(app)
        .put('/api/maps/'+mapId)
        .set('Authorization', 'Bearer 12345')
        .send(map)
        .expect(200)
        .expect(function(res) {
          var map = res.body;
          map.should.have.property('name', 'ChangedOSM');
          map.should.have.property('status');
          map.should.have.property('id', mapId);
          map.should.have.property('mapcacheUrl', '/api/sources/'+mapId);
          map.should.have.property('dataSources');
          console.log(res.body);
        })
        .end(done);
    });

    it ('should pull the overview tile', function(done) {
      request(app)
        .get('/api/maps/'+mapId+'/overviewTile')
        .set('Authorization', 'Bearer 12345')
        .expect(200)
        .expect(function(res) {
          console.log('res', res);
        })
        .end(done);
    });

    it ('should delete a datasource', function(done) {
      request(app)
        .delete('/api/maps/'+mapId+'/dataSources/'+map.dataSources[0].id)
        .set('Authorization', 'Bearer 12345')
        .expect(200)
        .expect(function(res) {
          var map = res.body;
          map.should.have.property('dataSources', []);
        })
        .end(done);
    });

    it ('should delete the source', function(done) {
      request(app)
        .delete('/api/maps/'+mapId)
        .set('Authorization', 'Bearer 12345')
        .expect(200)
        .expect(function(res) {
          var map = res.body;
          map.should.have.property('id', mapId);
          mapId = undefined;
        })
        .end(done);
    });

  });
});
