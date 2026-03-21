import { useEffect, useState } from "react";

export default function Timer() {
    const [time, setTime] = useState(30);

    useEffect(() => {
        const interval = setInterval(() => {
            setTime((t) => (t > 0 ? t - 1 : 0));
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    return <h3>⏳ Time Left: {time}s</h3>;
}