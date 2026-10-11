async function runTests() {
  const url = 'http://localhost:5000/api/auth';
  let token = '';

  try {
    console.log('Test 1 - Register');
    let res = await fetch(url + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email: 'testuser@example.com', password: 'Test@12345' })
    });
    let data = await res.json();
    console.log('Register response:', data);
    token = data.token;

    console.log('\nTest 2 - Duplicate Registration');
    res = await fetch(url + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email: 'testuser@example.com', password: 'Test@12345' })
    });
    data = await res.json();
    console.log('Duplicate Register response:', data);

    console.log('\nTest 3 - Invalid Registration');
    res = await fetch(url + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid@example.com' })
    });
    data = await res.json();
    console.log('Invalid Register response:', data);

    console.log('\nTest 4 - Login');
    res = await fetch(url + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'testuser@example.com', password: 'Test@12345' })
    });
    data = await res.json();
    console.log('Login response:', data);

    console.log('\nTest 5 - Wrong Password');
    res = await fetch(url + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'testuser@example.com', password: 'WrongPassword' })
    });
    data = await res.json();
    console.log('Wrong Password response:', data);

    console.log('\nTest 6 - /me Without Token');
    res = await fetch(url + '/me');
    data = await res.json();
    console.log('/me Without Token response:', data);

    console.log('\nTest 7 - /me With Invalid Token');
    res = await fetch(url + '/me', { headers: { Authorization: 'Bearer invalidtoken123' } });
    data = await res.json();
    console.log('/me Invalid Token response:', data);

    console.log('\nTest 8 - /me With Valid Token');
    res = await fetch(url + '/me', { headers: { Authorization: `Bearer ${token}` } });
    data = await res.json();
    console.log('/me Valid Token response:', data);

  } catch (err) {
    console.error(err);
  }
}
runTests();
