CREATE DATABASE IF NOT EXISTS ipl_auction;
USE ipl_auction;

CREATE TABLE IF NOT EXISTS players (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL,
  rating INT NOT NULL,
  base_price DECIMAL(5,2) NOT NULL,
  UNIQUE KEY uq_players_name (name)
);

INSERT INTO players (name, role, rating, base_price) VALUES
('Virat Kohli', 'Batter', 94, 12.0),
('Rohit Sharma', 'Batter', 92, 10.0),
('Shubman Gill', 'Batter', 90, 9.0),
('Jasprit Bumrah', 'Bowler', 96, 11.0),
('Hardik Pandya', 'All-Rounder', 91, 10.0),
('Rashid Khan', 'All-Rounder', 95, 11.0),
('MS Dhoni', 'Keeper', 89, 8.0),
('Suryakumar Yadav', 'Batter', 93, 10.0),
('Rishabh Pant', 'Keeper', 90, 9.0),
('Pat Cummins', 'Bowler', 92, 9.0),
('Kane Williamson', 'Batter', 88, 7.0),
('Andre Russell', 'All-Rounder', 90, 9.0)
ON DUPLICATE KEY UPDATE
  role = VALUES(role),
  rating = VALUES(rating),
  base_price = VALUES(base_price);
