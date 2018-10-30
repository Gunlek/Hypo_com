var express = require('express');
var cookieSession = require('cookie-session');
var mysql = require('mysql');
var bodyParser = require('body-parser');
var yml = require('yml');
var md5 = require('md5');
var urlencodedParser = bodyParser.urlencoded({ extended: false});


var connection = mysql.createConnection({
  host      : "localhost",
  user      : "root",
  password  : "",
  database  : "hypocom"
});

var app = express();

app.use(express.static(__dirname + '/public'))
.use(cookieSession({secret: 'HypoCom'}))
.use(function(req, res, next){
  if(typeof req.session.user_data == 'undefined' || req.session.user_data == null){
    req.session.user_data = {};
    req.session.user_data['authenticated'] = false;
    req.session.user_data['username'] = "";
    req.session.user_data['user_id'] = -1;
  }
  next();
})
.use(function(req, res, next){
  if(req.session.user_data['user_id'] > -1){
    connection.query('SELECT COUNT(mail_id) AS msg_count FROM mails WHERE unread = 1 AND dest_id = ?', [req.session.user_data['user_id']], function(error, results, fields){
      req.session.user_data['msg_count'] = parseInt(results[0]['msg_count']);
      next();
    });
  }
  else
    next();
})
.use(function(req, res, next){
  var today = new Date();
  var firstDayOfWeek = new Date(today);
  var lastDayOfWeek = new Date(today);
  firstDayOfWeek.setDate(today.getDate() - (today.getDay()-1));
  lastDayOfWeek.setDate(today.getDate() + (7 - today.getDay()));
  var current_week = firstDayOfWeek.getDate().toString() + "-" + (firstDayOfWeek.getMonth() + 1).toString() + "_" + lastDayOfWeek.getDate().toString() + "-" + (lastDayOfWeek.getMonth() + 1).toString();
  connection.query('SELECT * FROM plannings WHERE planning_week = ?', [current_week], function(errors, results, fields){
    if(results == null || results[0] == null){
      var newPlanning = {}
      for(var i = 0; i < 7; i++){
        newPlanning[i] = {};
        for(var k = 8; k <= 24; k++){
          newPlanning[i][(k-1).toString() + "h00-"+k.toString()+"h00"] = {}
        }
      }
      var stringPlanning = JSON.stringify(newPlanning);
      connection.query('INSERT INTO plannings(planning_week, planning_raw_data) VALUES(?, ?)', [current_week, stringPlanning], function(errors, results, fields){
        next();
      });
    }
    else
      next();
  });
})

.get('/', function(req, res){
  res.render('home.html.twig', {user_data: req.session.user_data});
})

/* #############################
 * ##     ESPACE MEMBRES      ##
 * #############################
*/
.get('/login', function(req, res){
  res.render('members/login.html.twig', {user_data: req.session.user_data});
})

.get('/register', function(req, res){
  res.render('members/register.html.twig', {user_data: req.session.user_data});
})

.get('/disconnect', function(req, res){
  req.session.user_data['authenticated'] = false;
  req.session.user_data['username'] = "";
  req.session.user_data['user_id'] = -1;
  req.session.user_data['msg_count'] = -1;
  res.redirect('/');
})

.post('/do-register', urlencodedParser, function(req, res){
  var username = req.body.username;
  var email = req.body.email;
  var phone = req.body.phone;
  var password = md5(req.body.password);
  var confPassword = md5(req.body.confPassword);

  if(password == confPassword
    && username != ""
    && email != ""
    && phone != ""){
      connection.query('INSERT INTO users(user_name, user_email, user_phone, user_password) VALUES(?, ?, ?, ?)', [username, email, phone, password]);
      res.redirect('/login');
    }
  else {
    res.redirect('/register?err=1');
  }
})

.post('/do-login', urlencodedParser, function(req, res){
  var username = req.body.username;
  var password = md5(req.body.password);
  connection.query('SELECT * FROM users WHERE user_name=? AND user_password=?', [username, password], function(err, results, fields){
    if(results[0] != null){
      req.session.user_data['authenticated'] = true;
      req.session.user_data['username'] = results[0]['user_name'];
      req.session.user_data['user_id'] = parseInt(results[0]['user_id']);
      res.redirect('/');
    }
    else{
      res.redirect('/login?err=1');
    }
  });
})

.get('/require-login', function(req, res){
  res.render('members/require_login.html.twig', {user_data: req.session.user_data});
})

/* ###########################
 * ##     ESPACE MAILS      ##
 * ###########################
*/
.get('/inbox', function(req, res){
  if(req.session.user_data.authenticated){
    connection.query('SELECT mails.*, users.* FROM mails INNER JOIN users ON sender_id = user_id WHERE dest_id = ? ORDER BY unread DESC', [req.session.user_data['user_id']], function(error, results, fields){
      connection.query('SELECT * FROM users', function(error, results_2, fields){
        res.render('mails/list_mails.html.twig', {user_data: req.session.user_data, user_list: results_2, inbox_mails: results});
      });
    });
  }
  else
    res.redirect('/require-login');
})

.post('/mails/send_message', urlencodedParser, function(req, res){
  var msg_sender = req.body.sender_id;
  var msg_dest = req.body.msgDest;
  var today = new Date();
  var msg_date = today.getDate() + "-" + String(today.getMonth()+1) + "-" + today.getFullYear();
  var msg_object = req.body.msgObject;
  var msg_content = req.body.msgContent;

  connection.query('INSERT INTO mails(sender_id, dest_id, mail_date, mail_object, mail_content) VALUES(?, ?, ?, ?, ?)', [msg_sender, msg_dest, msg_date, msg_object, msg_content]);
  res.redirect('/inbox');
})

.get('/mails/delete/:mail_id', function(req, res){
  var mail_id = req.params.mail_id;
  connection.query('DELETE FROM mails WHERE mail_id = ?', [mail_id]);
  res.redirect('/inbox');
})

/* ############################
 * ##     ESPACE MANIP'      ##
 * ############################
*/
.get('/manip', function(req, res){
  if(req.session.user_data.authenticated){
    connection.query('SELECT * FROM manips INNER JOIN users ON manips.manip_creator = users.user_id ORDER BY manip_vote_yes - manip_vote_no DESC', function(errors, results, fields){
      res.render('manip/list_manip.html.twig', {user_data: req.session.user_data, manip_list: results});
    });
  }
  else
    res.redirect('/require-login');
})

.post('/manip/send-manip', urlencodedParser, function(req, res){
  if(req.session.user_data.authenticated){
    var manip_creator_id = req.body.manipCreatorID;
    var manip_name = req.body.manipName;
    var manip_desc = req.body.manipDesc;
    var today = new Date();
    var manip_date = today.getDate() + "-" + String(today.getMonth()+1) + "-" + today.getFullYear();
    connection.query('INSERT INTO manips(manip_creator, manip_name, manip_desc, manip_date) VALUES(?, ?, ?, ?)', [manip_creator_id, manip_name, manip_desc, manip_date]);
    res.redirect('/manip');
  }
  else
    res.redirect('/require-login');
})

.get('/manip/vote-for/:manip_id', function(req, res){
  if(req.session.user_data.authenticated){
    var manip_id = parseInt(req.params.manip_id);
    connection.query('UPDATE manips SET manip_vote_yes = manip_vote_yes + 1 WHERE manip_id = ?', [manip_id]);
    res.redirect('/manip');
  }
  else
    res.redirect('/require-login');
})

.get('/manip/vote-against/:manip_id', function(req, res){
  if(req.session.user_data.authenticated){
    var manip_id = parseInt(req.params.manip_id);
    connection.query('UPDATE manips SET manip_vote_no = manip_vote_no + 1 WHERE manip_id = ?', [manip_id]);
    res.redirect('/manip');
  }
  else
    res.redirect('/require-login');
})

.get('/manip/delete/:manip_id/:creator_id', function(req, res){
  if(req.session.user_data.authenticated && parseInt(req.params.creator_id) == parseInt(req.session.user_data.user_id)){
    var manip_id = parseInt(req.params.manip_id);
    connection.query('DELETE FROM manips WHERE manip_id = ?', [manip_id]);
    res.redirect('/manip');
  }
  else
    res.redirect('/require-login');
})

/* ##############################
 * ##     ESPACE PLANNING      ##
 * ##############################
*/
.get('/planning', function(req, res){
  if(req.session.user_data.authenticated){
    var today = new Date();
    var firstDayOfWeek = new Date(today);
    var lastDayOfWeek = new Date(today);
    firstDayOfWeek.setDate(today.getDate() - (today.getDay()-1));
    lastDayOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    var current_week = firstDayOfWeek.getDate().toString() + "-" + (firstDayOfWeek.getMonth() + 1).toString() + "_" + lastDayOfWeek.getDate().toString() + "-" + (lastDayOfWeek.getMonth() + 1).toString();
    connection.query('SELECT * FROM plannings WHERE planning_week = ?', [current_week], function(errors, results, fields){
      connection.query('SELECT * FROM manips WHERE manip_vote_yes > manip_vote_no', function(errors, manips, fields){
        if(results != null && results[0] != null){
          res.render('plannings/view_planning.html.twig', {user_data: req.session.user_data, current_planning: JSON.parse(results[0].planning_raw_data), current_week: current_week, manip_list: manips})
        }
        else
          res.render('plannings/view_planning.html.twig', {user_data: req.session.user_data, current_planning: null, current_week: current_week, manip_list: manips})
      });
    });
  }
  else
    res.redirect('/require-login');
})

.post('/planning/add-date', urlencodedParser, function(req, res){
  if(req.session.user_data.authenticated){
    var hour_regex =  /([0-9]*)\:([0-9]*)/g;
    var date_regex =  /([0-9]*)\/([0-9]*)\/([0-9]*)/g;

    var eventDate = req.body.eventDate;
    var eventHour = req.body.eventHour;
    var eventDuration = parseInt(req.body.eventDuration);
    var eventColor = req.body.eventColor;
    var eventName = req.body.eventName;
    var eventDesc = req.body.eventDesc;

    var splitted_hour = hour_regex.exec(eventHour);
    var splitted_date = date_regex.exec(eventDate);

    var eventHour_hour = parseInt(splitted_hour[1]);
    var eventHour_min = parseInt(splitted_hour[2]);
    var eventDate_day = parseInt(splitted_date[1]);
    var eventDate_month = parseInt(splitted_date[2]);
    var eventDate_year = parseInt(splitted_date[3]);

    var originDate = new Date(eventDate_year.toString() + "-" + eventDate_month.toString() + "-" + eventDate_day.toString() + "T12:00:00");
    var firstDayOfWeek = new Date(originDate);
    var lastDayOfWeek = new Date(originDate);
    firstDayOfWeek.setDate(originDate.getDate() - (originDate.getDay()-1));
    lastDayOfWeek.setDate(originDate.getDate() + (7 - originDate.getDay()));

    var current_week = firstDayOfWeek.getDate().toString() + "-" + (firstDayOfWeek.getMonth() + 1).toString() + "_" + lastDayOfWeek.getDate().toString() + "-" + (lastDayOfWeek.getMonth() + 1).toString();

    connection.query('SELECT * FROM plannings WHERE planning_week = ?', [current_week], function(errors, results, fields){
      if(results != null && results[0] != null){
        var JSONPlanning = JSON.parse(results[0].planning_raw_data);
        var updateDay = originDate.getDay() - 1;
        var k = 0;
        for(h = eventHour_hour; h < eventHour_hour + eventDuration; h++){
          var current_interval = h.toString() + "h00-" + (h+1).toString() + "h00";
          JSONPlanning[updateDay][current_interval]["color"] = eventColor;
          JSONPlanning[updateDay][current_interval]["event_name"] = eventName;
          JSONPlanning[updateDay][current_interval]["event_desc"] = eventDesc;
          JSONPlanning[updateDay][current_interval]["manip_iteration"] = k;
          k++;
        }
        connection.query('UPDATE plannings SET planning_raw_data = ? WHERE planning_week = ?', [JSON.stringify(JSONPlanning), current_week]);
      }
    });
    res.redirect('/planning');
  }
  else
    res.redirect('/require-login');
})

.post('/planning/insert-manip', urlencodedParser, function(req, res){
  if(req.session.user_data.authenticated){
    var eventDate = req.body.eventDate;
    var eventHour = req.body.eventHour;
    var eventDuration = parseInt(req.body.eventDuration);
    var manipId = parseInt(req.body.manipId);

    var hour_regex =  /([0-9]*)\:([0-9]*)/g;
    var date_regex =  /([0-9]*)\/([0-9]*)\/([0-9]*)/g;

    var splitted_hour = hour_regex.exec(eventHour);
    var splitted_date = date_regex.exec(eventDate);

    var eventHour_hour = parseInt(splitted_hour[1]);
    var eventHour_min = parseInt(splitted_hour[2]);
    var eventDate_day = parseInt(splitted_date[1]);
    var eventDate_month = parseInt(splitted_date[2]);
    var eventDate_year = parseInt(splitted_date[3]);

    var originDate = new Date(eventDate_year.toString() + "-" + eventDate_month.toString() + "-" + eventDate_day.toString() + "T12:00:00");
    var firstDayOfWeek = new Date(originDate);
    var lastDayOfWeek = new Date(originDate);
    firstDayOfWeek.setDate(originDate.getDate() - (originDate.getDay()-1));
    lastDayOfWeek.setDate(originDate.getDate() + (7 - originDate.getDay()));

    var current_week = firstDayOfWeek.getDate().toString() + "-" + (firstDayOfWeek.getMonth() + 1).toString() + "_" + lastDayOfWeek.getDate().toString() + "-" + (lastDayOfWeek.getMonth() + 1).toString();
    connection.query('SELECT * FROM plannings WHERE planning_week = ?', [current_week], function(errors, results, fields){
      connection.query('SELECT * FROM manips WHERE manip_id = ?', [manipId], function(errors, manips, fields){
        if(results != null && results[0] != null && manips != null && manips[0] != null){
          var JSONPlanning = JSON.parse(results[0].planning_raw_data);
          var updateDay = originDate.getDay() - 1;
          var k = 0;
          for(h = eventHour_hour; h < eventHour_hour + eventDuration; h++){
            var current_interval = h.toString() + "h00-" + (h+1).toString() + "h00";
            JSONPlanning[updateDay][current_interval]["color"] = "red";
            JSONPlanning[updateDay][current_interval]["event_name"] = manips[0].manip_name;
            JSONPlanning[updateDay][current_interval]["event_desc"] = manips[0].manip_desc;
            JSONPlanning[updateDay][current_interval]["manip_iteration"] = k;
            k++;
          }
          connection.query('UPDATE plannings SET planning_raw_data = ? WHERE planning_week = ?', [JSON.stringify(JSONPlanning), current_week]);
        }
      });
    });
    res.redirect('/planning');
  }
  else
    res.redirect('/require-login');
})

/* #############################
 * ##     ESPACE SONDAGE      ##
 * #############################
*/

/* #############################
 * ##     ESPACE COMPIL'      ##
 * #############################
*/
.get('/thinking_wall', function(req, res){
  if(req.session.user_data.authenticated){
    compilList = {};
    placedItems = 0;
    JSONIndex = 0;
    connection.query('SELECT * FROM compil', function(errors, results, fields){
      if(results.length > 0){
        results.forEach(function(current){
          if(placedItems % 4 == 0)
          {
            JSONIndex++;
            compilList[JSONIndex-1] = {};
          }
          compilList[JSONIndex-1][current['compil_id']] = {compil_id: current['compil_id'], compil_author: current['compil_author'], compil_title: current['compil_title'], compil_content: current['compil_content']};

          if(placedItems >= results.length - 1)
            res.render('thinking_wall/view_thinking_wall.html.twig', {user_data: req.session.user_data, compil_list: compilList});

          placedItems++;
        });
      }
      else
        res.render('thinking_wall/view_thinking_wall.html.twig', {user_data: req.session.user_data, compil_list: []});
    });
  }
  else
    res.redirect('/require-login');
})

.get('/thinking_wall/delete/:id', function(req, res){
  if(req.session.user_data.authenticated){
    var compil_id = parseInt(req.params.id);
    connection.query('DELETE FROM compil WHERE compil_id = ?', [compil_id]);
    res.redirect('/thinking_wall');
  }
  else
    res.redirect('/require-login');
})

.post('/thinking_wall/add', urlencodedParser, function(req, res){
  if(req.session.user_data.authenticated){
    var compilTitle = req.body.compil_title;
    var compilAuthor = req.body.compil_author;
    var compilContent = req.body.compil_content;

    connection.query('INSERT INTO compil(compil_author, compil_title, compil_content) VALUES(?, ?, ?)', [compilAuthor, compilTitle, compilContent]);
    res.redirect('/thinking_wall');
  }
  else
    res.redirect('/require-login');
})

.listen(1234);
