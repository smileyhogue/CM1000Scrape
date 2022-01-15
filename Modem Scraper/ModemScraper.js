const { Builder, By, Key, until } = require('selenium-webdriver');
require('chromedriver');
const sql = require('mssql');
// import fs
const fs = require('fs');
var configJson = fs.readFileSync('./conf.json');
var config = JSON.parse(configJson);

//create sql config
const sqlConfig = {
    user: config.sqlUser,
    password: config.sqlPass,
    server: config.sqlHost,
    database: config.sqlDatabase,
    options: {
        trustServerCertificate: config.sqlTrust
      }
};

// create sleep function
function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

// create function to setup sql table with columns Channel, Lock Status, Modulataion, Channel ID, Frequency, Power, SNRMER, UnErrored Codewords, Correctable Codewords, Uncorrectable Codewords
async function setupTable() {
    try {
        await sql.connect(sqlConfig);
        let request = new sql.Request();
        await request.query(`IF OBJECT_ID('${config.sqlTable}', 'U') IS NOT NULL
        DROP TABLE ${config.sqlTable};
        CREATE TABLE ${config.sqlTable} (
            CreateTime DATETIME NOT NULL,
            Channel INT,
            LockStatus varchar(255),
            Modulation varchar(255),
            ChannelID FLOAT,
            Frequency FLOAT,
            Power FLOAT,
            SNRMER FLOAT,
            UnErroredCodewords FLOAT,
            CorrectableCodewords FLOAT,
            UncorrectableCodewords FLOAT
        );`);
        console.log('Table created');
    } catch (err) {
        console.log('Table creation error: ' + err);
    }
}
// create function to check if the Modem table exists and create it if not
async function checkTable() {
    try {
        await sql.connect(sqlConfig);
        const result = await sql.query(`SELECT * FROM ${config.sqlTable}`);
        if (result.recordset.length > 0) {
            console.log('Table exists');
        }
    } catch (err) {
        console.log('Table check error: ' + err);
        setupTable();
    }
}

//create function to scrape 192.168.100.1
async function scrapeModem() {
    //create new instance of chrome headless
    const chrome = require('selenium-webdriver/chrome');
    const driver = await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().headless()).build();
    //navigate to
    await driver.get(`http://admin:password@${config.modemHost}/DocsisStatus.asp`);
    // get dsTable table and split into rows
    const rows = await driver.findElements(By.css('#dsTable > tbody > tr'));
    console.log(rows.length);
    //create empty array to store data
    const data = [];
    //loop through rows
    for (let i = 0; i < rows.length; i++) {
        //get cells
        const cells = await rows[i].findElements(By.css('td'));
        console.log(cells.length);
        //create empty array to store data
        const row = [];
        //loop through cells
        for (let j = 0; j < cells.length; j++) {
            //get text
            const text = await cells[j].getText();
            //push text to row
            row.push(text);
        }
        //push row to data
        data.push(row);
    }
    // close window
    await driver.quit();
    //return data
    return data;

}

//create function to get data for a specific row and column from scrapeModem() 
async function getDataPoint(data, row, column) {
    //call scrapeModem()
    const dataPoint = data;
    //return data for specific row and column
    return dataPoint[row][column];
}

// create funtion to use getData to push values from all rows to database
async function pushData() {
    const data = await scrapeModem();
    // print start of function
    console.log('Starting pushData');
    //create new instance of sql
    await sql.connect(sqlConfig);
    const request = new sql.Request();
    // print sql established
    console.log('SQL established');
    //loop through rows
    for (let i = 1; i < data.length; i++) {
        // print row start
        console.log('Row ' + i + ':');
        //get data for specific row and column
        const channel = await getDataPoint(data, i, 0);
        const lockStatus = await getDataPoint(data, i, 1);
        const modulation = await getDataPoint(data, i, 2);
        const channelID = await getDataPoint(data, i, 3);
        const frequency = await getDataPoint(data, i, 4);
        const power = await getDataPoint(data, i, 5);
        const snrmer = await getDataPoint(data, i, 6);
        const unErroredCodewords = await getDataPoint(data, i, 7);
        const correctableCodewords = await getDataPoint(data, i, 8);
        const uncorrectableCodewords = await getDataPoint(data, i, 9);
        //insert data into database
        await request.query(`INSERT INTO ModemScraper (CreateTime, Channel, LockStatus, Modulation, ChannelID, Frequency, Power, SNRMER, UnErroredCodewords, CorrectableCodewords, UncorrectableCodewords)
        VALUES (GETDATE(), ${channel}, '${lockStatus}', '${modulation}', ${channelID}, ${frequency.replace(/[^\d.-]/g, '')}, ${power.replace(/[^\d.-]/g, '')}, ${snrmer.replace(/[^\d.-]/g, '')}, ${unErroredCodewords}, ${correctableCodewords}, ${uncorrectableCodewords})`);
        // console loge finished
        console.log('Finished');
        // close sql connection
    }
    await sql.close();
}

// check database
checkTable();
doWork();
// create function called doWork
async function doWork() {
    while (true) {
        pushData();
        console.log('Data pushed');
        await sleep(config.Interval);
    }
}
