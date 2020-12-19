import {checkForIndexedDb, useIndexedDb } from "./indexedDb.js";
let transactions = [];
let myChart;

let gotIndexedDb = checkForIndexedDb();
// let gotIndexedDb = window.indexedDB;

fetch("/api/transaction")
  .then(response => {
    return response.json();
  })
  .then(data => {
    // save db data on global variable
    transactions = data;

    populateTotal();
    populateTable();
    populateChart();
  })
  .catch(err => {
    // If could not retrive from DB, get what's in IndexedDB
    console.log("Error retrieving data: " + err);
    if (gotIndexedDb) {
      useIndexedDb("budget", "budgetStore", "get")
      .then(data => {
        // save db data on global variable
        transactions = data;
        populateTotal();
        populateTable();
        populateChart();
      });
    };
  });

function populateTotal() {
  // reduce transaction amounts to a single total value
  let total = transactions.reduce((total, t) => {
    return total + parseInt(t.value);
  }, 0);

  let totalEl = document.querySelector("#total");
  totalEl.textContent = total;
}

function populateTable() {
  let tbody = document.querySelector("#tbody");
  tbody.innerHTML = "";

  transactions.forEach(transaction => {
    // create and populate a table row
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${transaction.name}</td>
      <td>${transaction.value}</td>
    `;

    tbody.appendChild(tr);
  });
}

function populateChart() {
  // copy array and reverse it
  let reversed = transactions.slice().reverse();
  let sum = 0;

  // create date labels for chart
  let labels = reversed.map(t => {
    let date = new Date(t.date);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  });

  // create incremental values for chart
  let data = reversed.map(t => {
    sum += parseInt(t.value);
    return sum;
  });

  // remove old chart if it exists
  if (myChart) {
    myChart.destroy();
  }

  let ctx = document.getElementById("myChart").getContext("2d");

  myChart = new Chart(ctx, {
    type: 'line',
      data: {
        labels,
        datasets: [{
            label: "Total Over Time",
            fill: true,
            backgroundColor: "#6666ff",
            data
        }]
    }
  });
};

function sendTransaction(isAdding) {
  let nameEl = document.querySelector("#t-name");
  let amountEl = document.querySelector("#t-amount");
  let errorEl = document.querySelector(".form .error");

  // validate form
  if (nameEl.value === "" || amountEl.value === "") {
    errorEl.textContent = "Missing Information";
    return;
  }
  else {
    errorEl.textContent = "";
  }

  // create record
  let transaction = {
    name: nameEl.value,
    value: amountEl.value,
    date: new Date().toISOString()
  };

  // if subtracting funds, convert amount to negative number
  if (!isAdding) {
    transaction.value *= -1;
  }

  // add to beginning of current array of data
  transactions.unshift(transaction);

  // re-run logic to populate ui with new record
  populateChart();
  populateTable();
  populateTotal();
  
  // also send to server
  fetch("/api/transaction", {
    method: "POST",
    body: JSON.stringify(transaction),
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json"
    }
  })
  .then(response => {    
    return response.json();
  })
  .then(data => {
    if (data.errors) {
      errorEl.textContent = "Missing Information";
    }
    else {
      // clear form
      nameEl.value = "";
      amountEl.value = "";
    }
  })
  .catch(err => {
    // fetch failed, so save in indexed db
    saveRecord(transaction);

    // clear form
    nameEl.value = "";
    amountEl.value = "";
  });
};

function saveRecord(transaction) {
    if (gotIndexedDb) {
      // IndexedDb requires a _id value; this one is temporary unti saved to database
      transaction._id = Date.now();
      useIndexedDb("budget", "budgetStore", "put", transaction);
    };
  };  

document.querySelector("#add-btn").onclick = function() {
  sendTransaction(true);
};

document.querySelector("#sub-btn").onclick = function() {
  sendTransaction(false);
};

window.ononline = function() {
    // When returning to online status, check to see if transactions were saved in IndexedDb
    if (gotIndexedDb) {
      useIndexedDb("budget", "budgetStore", "get")
      .then(data => {
        // If transactions found, then add to database
        if (data.length > 0) {
          // Need to delete _id so that they'll be set correctly when written to database
          data.forEach(item => delete item._id);
          
          fetch("/api/transaction/bulk", {
            method: "POST",
            body: JSON.stringify(data),
            headers: {
              Accept: "application/json, text/plain, */*",
              "Content-Type": "application/json"
            }
          })
          .then(res => {
            // When transaction successfully written to db, delete all from IndexedDb
            useIndexedDb("budget", "budgetStore", "delete")
          })
          .catch(err => {
            console.log("Error saving cached records to databse: " + err);
          });
        };
      });
    };
  };