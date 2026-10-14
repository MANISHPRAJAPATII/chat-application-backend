CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE CHAT (
        id SERIAL PRIMARY KEY,
   user_a_id INT NOT NULL REFERENCES users(id),
      user_B_id INT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (user_a_id < user_b_id),
        UNIQUE (user_a_id, user_b_id)
);

INSERT INTO users (name) VALUES ('Test'), ('Manish')