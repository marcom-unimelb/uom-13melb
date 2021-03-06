var directory = require("./directory");
var express = require("express");
var neo4j = require("neo4j");
var http = require("http");
var airbrake = require("airbrake");
var bodyParser = require("body-parser");
var q = require("q");
var multer = require("multer");

var app = express();

//var airbrake = require('airbrake').createClient(process.env.AIRBRAKE_API_KEY);
app.use(bodyParser.urlencoded({
	extended : true
}));
app.use(multer({ dest: './uploads/'}));
//app.use(airbrake.expressHandler());

app.all('*', function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE");
	//res.header("Content-Type", "application/json");
	next();
});

console.log(process.env.GRAPHENEDB_URL);
var server = new neo4j.GraphDatabase(process.env.GRAPHENEDB_URL);

var dir = new directory.Directory(server);

/**
 * Area
 */

var send_json = function (res, object) {
	var recursive_delete = function(structure, property) {
		delete structure[property];
		Object.keys(structure).forEach(function (key) {
			if (structure[key] instanceof Object) {
				recursive_delete(structure[key], property);
			}
		});
	}
	if (object) recursive_delete(object, "directory");
	res.send(object);
}

var send_error = function (res, text) {
	send_json(res, {error: text});
}

app.param("area", function (req, res, next, id) {
	var promise;
	if (id == "root") {
		promise = dir.root_area();
	} else {
		promise = dir.area(id);
	}
	promise.then(
		function (area) {
			req.area = area;
			next();
		},
		function (err) {
			res.json({error: "No area."});
			req.area = null;
			next(err);
		}
	);
});

app.param("collection", function (req, res, next, id) {
	dir.collection(id).then(
		function (collection) {
			req.collection = collection;
			next();
		},
		function (err) {
			res.json({error: "No collection."});
			next(err);
		}
	);
});

app.param("contact", function (req, res, next, id) {
	dir.contact(id).then(
		function (contact) {
			req.contact = contact;
			next();
		},
		function (err) {
			res.json({error: "No contact."});
			next(err);
		});
});

app.use(function(err, req, res, next) {
  res.end();
});

app.get("/", function (req, res, next) {
	res.json({});
	next();
});

app.get("/area/:area", function (req, res, next) {
	if (req.area) {
		send_json(res, req.area);
	}
	next();
});

// insert
app.post("/area/:area", function (req, res, next) {
	if (req.area) {
		req.area.new_child(req.body).then(function (area) {
			if (area) {
				send_json(res, area);
			} else send_error(res, "Area could not be created.")
			next();
		});
	}
});

// update
app.put("/area/:area", function (req, res, next) {
	if (req.area) {
		req.area.update(req.body).then(function (area) {
			send_json(res, area);
			next();
		});
	}
});

// change parent
app.put("/area/:area/parent", function (req, res, next) {
	if (req.area) {
		req.area.change_parent(req.body).then(function (area) {
			send_json(res, area);
			next();
		});
	}
});

// delete
app.delete("/area/:area", function (req, res, next) {
	if (req.area) {
		req.area.detach().then(function (parent) {
			send_json(res, parent);
			next();
		});
	}
});

app.get("/area/:area/children", function (req, res, next) {
	if (req.area) {
		req.area.children().then(function (area) {
			send_json(res, area);
			next();
		});
	} else next();
});

app.get("/area/:area/descendents", function (req, res, next) {
	if (req.area) {
		var hops = null;
		if (req.query.depth) hops = parseInt(req.query.depth);
		req.area.descendents(hops).then(function (area) {
			send_json(res, area);
			next();
		})
	} else next();
});

app.get("/area/:area/path", function (req, res, next) {
	if (req.area) {
		req.area.path(req.query.base).then(function (area) {
			send_json(res, area);
			next();
		});
	} else next();
})

app.get("/area/:area/parent", function (req, res, next) {
	if (req.area) {
		req.area.parent().then(function (area) {
			send_json(res, area);
			next();
		});
	} else next();
});

// ?q=query
app.get("/area/:area/search", function (req, res, next) {
	if (req.area) {
		req.area.search(decodeURIComponent(req.query.q)).then(function (area) {
			send_json(res, area);
			next();
		});
	} else next();
});

app.get("/area/:area/all_contacts", function (req, res, next) {
	if (req.area) {
		req.area.all_contacts().then(function (result) {
			send_json(res, result);
			next();
		});
	} else next();
});

app.get("/area/:area/descendent_contact_count", function (req, res, next) {
	if (req.area) {
		req.area.descendent_contact_count().then(function (result) {
			send_json(res, result);
			next();
		});
	} else next();
});

app.get("/area/:area/collections", function (req, res, next) {
	if (req.area) {
		req.area.collections().then(function (result) {
			send_json(res, result);
			next();
		});
	} else next();
});

app.post("/area/:area/upload", function (req, res, next) {
	if (req.files && req.files["datafile"]) {
		req.area.bulk_import(req.files["datafile"]["path"]).then(function (result) {
			send_json(res, result);
			next();
		});
	} else {
		res.json({error : "No file selected."});
		next();
	}
})

/**
 * Collection routes.
 */

app.get("/collection/:collection", function (req, res, next) {
	q.spread([
		req.collection.contacts(),
		req.collection.successors()
	], function (contacts, successors) {
		send_json(res, {
			collection_id : req.collection.collection_id,
			contacts : contacts,
			successors : successors
		});
		next();
	});
});

app.post("/collection/:collection/primary", function (req, res, next) {
	req.collection.toggle_primary().then(function (collection) {
		send_json(res, collection);
		next();
	});
});

// creates an entirely new collection. Should only be used when
// there are no existing collections.
app.post("/area/:area/collections", function (req, res, next) {
	if (req.area) {
		req.area.new_collection().then(function (collection) {
			send_json(res, collection);
			next();
		});
	}
});

// merges :collection INTO GIVEN COLLECTION
// :collection IS DELETED, given collection remains
app.delete("/collection/:collection", function (req, res, next) {
	if (req.body.collection_id) {
		dir.collection(req.body.collection_id).then(function (collection) {
			return collection.merge(req.collection);
		}).then(function (collection) {
			send_json(res, collection);
			next();
		});
	} else next();
});

app.get("/collection/:collection/contacts", function (req, res, next) {
	req.collection.contacts().then(function (contacts) {
		send_json(res, contacts);
		next();
	});
});

// create new contact / add existing contact to collection
app.post("/collection/:collection/contacts", function (req, res, next) {
	req.collection.new_contact(req.body).then(function (contact) {
		send_json(res, contact);
		next();
	});
});

// remove contacts from collection, creating a new collection for them
// returns the new collection
app.delete("/collection/:collection/contacts", function (req, res, next) {
	req.collection.split(req.body.contacts).then(function (collection) {
		send_json(res, collection);
		next();
	});
});

app.get("/collection/:collection/successors", function (req, res, next) {
	req.collection.successors().then(function (successors) {
		send_json(res, successors);
		next();
	});
})
// place a collection as a successor to this collection
app.post("/collection/:collection/successors", function (req, res, next) {
	req.collection.add_successor(req.body).then(function (collection) {
		send_json(res, collection);
		next();
	});
});

// removes successor collection
app.delete("/collection/:collection/successors", function (req, res, next) {
	req.collection.remove_successor(req.body).then(function (collection) {
		send_json(res, collection);
		next();
	});
});

/**
 * Contact routes
 */

app.get("/contact", function (req, res, next) {
	if (!req.query.q) {
		send_json(res, {});
		next();
	} else {
		dir.contact_search(decodeURIComponent(req.query.q)).then(function (contacts) {
			send_json(res, contacts);
			next();
		});
	}
});

app.get("/contact/:contact", function (req, res, next) {
	console.log(req.contact);
	send_json(res, req.contact);
	next();
});

app.put("/contact/:contact", function (req, res, next) {
	req.contact.update(req.body).then(function (contact) {
		send_json(res, contact);
		next();
	});
});

// detaches contact from supplied collection
app.delete("/contact/:contact", function (req, res, next) {
	req.contact.detach(req.body).then(function (contact) {
		send_json(res, contact);
		next();
	});
});

/**
 * Orphan routes
 */

// get area orphans
app.get("/orphan/area", function (req, res, next) {
	dir.orphan_areas().then(function (areas) {
		send_json(res, areas);
		next();
	});
});

app.delete("/orphan/area/:area", function (req, res, next) {
	req.area.remove().then(function (result) {
		send_json(res, result);
		next();
	});
});

/**
 * Batch routes
 */

app.get("/batch/area/all_contacts", function (req, res, next) {
	var areas = req.query.area.split(",");
	var contacts = {};
	console.log(areas);
	q.all(areas.map(function (area_id) {
		return dir.area(area_id).then(function (area) {
			console.log(area);
			return area.all_contacts();
		});
	})).then(function (results) {
		console.log(results);
		areas.forEach(function (area_id, index) {
			contacts[area_id] = results[index];
		});
		send_json(res, contacts);
		next();
	});
});

/**
 * Dummy ending middleware
 */

/*app.all("*", function (req, res, next) {
	// do nothing
	next();
});*/

app.listen(process.env.PORT || 5000);
console.log("Listening on port " + (process.env.PORT || 5000));

