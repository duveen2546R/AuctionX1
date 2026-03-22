CREATE DATABASE IF NOT EXISTS ipl_auction;
USE ipl_auction;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_code VARCHAR(10) UNIQUE,
    host_id INT,
    status ENUM('waiting', 'ongoing', 'finished') DEFAULT 'waiting',
    max_players INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE,
    budget INT DEFAULT 100
);


CREATE TABLE IF NOT EXISTS room_players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT,
    user_id INT,
    budget INT DEFAULT 100,
    team_name VARCHAR(50),
    team_id INT NULL,
    
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cricketers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    role ENUM('batsman', 'bowler', 'allrounder', 'wicketkeeper'),
    base_price INT,
    rating INT,
    batting_rating INT DEFAULT 0,
    bowling_rating INT DEFAULT 0,
    country VARCHAR(50) DEFAULT 'India',
    UNIQUE KEY uq_cricketers_name (name)
);

CREATE TABLE IF NOT EXISTS bids (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT,
    player_id INT,
    user_id INT,
    bid_amount INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES cricketers(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS team_players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT,
    user_id INT,
    player_id INT,
    price INT,
    
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES cricketers(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS auction_state (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT,
    current_player_id INT,
    current_bid INT,
    highest_bidder INT,
    status ENUM('not_started', 'in_progress', 'ended') DEFAULT 'not_started',
    
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (current_player_id) REFERENCES cricketers(id) ON DELETE SET NULL,
    FOREIGN KEY (highest_bidder) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS playing11 (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT,
    user_id INT,
    player_ids TEXT,
    score DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_playing11_room_user (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO cricketers (name, role, base_price, rating) VALUES
('Virat Kohli', 'batsman', 12, 94),
('Rohit Sharma', 'batsman', 10, 92),
('Shubman Gill', 'batsman', 9, 90),
('Jasprit Bumrah', 'bowler', 11, 96),
('Hardik Pandya', 'allrounder', 10, 91),
('Rashid Khan', 'allrounder', 11, 95),
('MS Dhoni', 'wicketkeeper', 8, 89),
('Suryakumar Yadav', 'batsman', 10, 93),
('Rishabh Pant', 'wicketkeeper', 9, 90),
('Pat Cummins', 'bowler', 9, 92),
('Kane Williamson', 'batsman', 7, 88),
('Andre Russell', 'allrounder', 9, 90)
ON DUPLICATE KEY UPDATE
  role = VALUES(role),
  base_price = VALUES(base_price),
  rating = VALUES(rating);
