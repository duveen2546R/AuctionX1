import { useLocation } from "react-router-dom";

export default function Result() {
    const { state } = useLocation();

    return (
        <div className="container">
            <h1>🏆 Winner</h1>
            <h2>{state?.winner}</h2>
        </div>
    );
}