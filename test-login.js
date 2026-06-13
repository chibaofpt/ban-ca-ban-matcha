const axios = require('axios');

async function testLogin() {
  try {
    const res = await axios.post('http://localhost:3000/api/auth/login', {
      phone_number: '0949129932',
      password: 'password' // Assuming this is the password, or maybe 123456?
    });
    console.log("Login success:", res.data);
  } catch (err) {
    console.error("Login failed:", err.response?.data || err.message);
  }
}

testLogin();
