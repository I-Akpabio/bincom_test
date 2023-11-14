var mysql = require("mysql");
var bodyParser = require("body-parser");
const moment = require("moment");
const _ = require("lodash");

var con = mysql.createConnection({
  host: "127.0.0.1",
  port: "3306",
  user: "root",
  password: "",
  database: "bincomphptest",
});

const express = require("express");
var cors = require("cors");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

app.use(bodyParser.raw());

app.set("view engine", "ejs");
app.set("views", "./views");

con.connect(function (err) {
  if (err) throw err;
  console.log("Connected!");
});

app.get("/", async (req, res) => {
  const pUnit = req.query.punit;

  if (req.query.punit) {
    con.query(
      `SELECT * FROM announced_pu_results WHERE polling_unit_uniqueid='${pUnit}'`,
      (err, pUnitResult) => {
        if (err) throw err;

        // console.log(pUnitResult, pUnit);

        res.render("index", {
          title: "Poling Unit Results",
          punit: req.query.punit,
          pUnitResult: pUnitResult.length ? pUnitResult : [],
        });
      }
    );
  } else {
    res.render("index", {
      title: "All Poling Unit Results",
      punit: req.query.punit,
    });
  }
});

app.get("/states", (req, res) => {
  con.query(`SELECT * FROM states`, (err, result) => {
    if (err) {
      res.send("Error");
    }

    res.send(result);
  });
});

app.get("/lga-of-state", (req, res) => {
  con.query(
    `SELECT * FROM lga WHERE state_id='${req.query.state}'`,
    (err, result) => {
      if (err) {
        res.send("Error");
      }

      res.send(result);
    }
  );
});

app.get("/all-polling-unit-of-lga", (req, res) => {
  con.query(
    `select * from polling_unit where lga_id='${req.query.lga}'`,
    (err, result) => {
      if (err) {
        res.send("Error");
      }

      res.send(result);
    }
  );
});


app.get("/one-polling-unit", (req, res) => {
  con.query(
    `select * from polling_unit where uniqueid='${req.query.punit}'`,
    (err, result) => {
      if (err) {
        res.send("Error");
      }

      res.send(result);
    }
  );
});

app.get("/polling-unit-of-lga", (req, res) => {
  con.query(
    `select * from polling_unit 
    where polling_unit.uniqueid not in 
      (select polling_unit_uniqueid from announced_pu_results) 
    AND lga_id='${req.query.lga}'`,
    (err, result) => {
      if (err) {
        res.send("Error");
      }

      res.send(result);
    }
  );
});

app.get("/new-results", (req, res) => {
  con.query("SELECT * FROM polling_unit", (err, result) => {
    if (err) {
      res.send("Error");
    }

    con.query("SELECT * FROM party", (err2, parties) => {
      res.render("add-results", {
        title: "All Poling Unit Results",
        pollingUnits: result,
        parties,
      });
    });
  });
});

app.post("/submit-polling-results", (req, res) => {
  // console.log(req.body);

  if (!Array.isArray(req.body.results)) {
    res.send("Error");
    return;
  }

  const SQL = `INSERT INTO announced_pu_results (
    polling_unit_uniqueid, 
    party_abbreviation,
    party_score,
    entered_by_user,
    date_entered,
    user_ip_address
    ) VALUES ?`;

  // console.log(req.body);

  const values = req.body.results
    .map((row) => {
      return [
        req.body.pollingUnit,
        row.name,
        row.value,
        req.body.officer,
        moment().format("YYYY-MM-DD HH:MM:SS").toString(),
        "192.168.1.101",
      ];
    })
    .filter((row) => row[2]);

  con.query(SQL, [values], function (err, result) {
    if (err) throw err;
    console.log("Number of records inserted: " + result.affectedRows);
  });

  res.send(req.body);
});

app.get("/total-results", (req, res) => {
  const SQL = `
          SELECT * FROM announced_pu_results 
          JOIN polling_unit ON announced_pu_results.polling_unit_uniqueid=polling_unit.uniqueid 
          WHERE polling_unit.lga_id='${req.query.lga}'
        `;

  const partyFn = (partyerr, partyresult) => {
    con.query("SELECT * FROM lga", (err, result) => {
      // if the request comes with a lga query fetch the list of polling unit
      // results that correspond to that lga
      if (req.query.lga) {
        const lga = result.filter((item) => item.lga_id == req.query.lga)[0];

        con.query(SQL, (err, lgaResult) => {
          /* Use the list of results from the db to generate a map of party to party
           * scores sum such as { pdp:300, adc: 450 ...}
           */
          const resTotal = {};

          for (let x of lgaResult) {
            const key = x.party_abbreviation;
            if (resTotal[key]) {
              resTotal[key] += Number(x.party_score);
            } else {
              resTotal[key] = Number(x.party_score);
            }
          }

          var grouped = _.mapValues(
            _.groupBy(lgaResult, "polling_unit_uniqueid"),
            (clist) => clist.map((row) => _.omit(row, "polling_unit_uniqueid"))
          );

          let finalResult = [];

          for (let key of Object.keys(grouped)) {
            let arrRow = [];
            const row = grouped[key];
            for (let party of partyresult) {
              const partyInstance = row.filter(
                (item) => item.party_abbreviation == party.partyid
              );

              if (!partyInstance.length) {
                arrRow.push(0);
              } else {
                arrRow.push(partyInstance[0].party_score);
              }
            }

            finalResult.push(arrRow);
          }

          // console.log(finalResult);

          res.render("total-results", {
            activeLga: lga,
            lgaResult: lgaResult,
            totals: resTotal,
            selectedLga: req.query.lga,
            finalResult,
            partyresult,
          });
        });
      } else {
        res.render("total-results", {
          lgaList: result,
          selectedLga: req.query.lga,
        });
      }
    });
  };

  con.query("SELECT * FROM party", partyFn);
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
