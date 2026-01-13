const { looksLikeAddress, validateAddressRegion, computeBoundingBoxAreasMeters } = require('./address_check.js');

const address = "Bristol Pension, 9, Beleza Street, Asmara, Maekel Region, Eritrea"
const country = 'Eritrea'
const nominatim = ["13.8718477","13.8719477","43.6984081","43.6985081"]
console.log(looksLikeAddress(address))
console.log(validateAddressRegion(address, country))
console.log(computeBoundingBoxAreasMeters(nominatim))