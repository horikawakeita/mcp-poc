import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import cors from 'cors';

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";

const getServer = () => {
    // Create server instance
    const server = new McpServer({
        name: "weather",
        version: "1.0.0",
        capabilities: {
            resources: {},
            tools: {},
        },
    });

    // Helper function for making NWS API requests
    async function makeNWSRequest<T>(url: string): Promise<T | null> {
        const headers = {
            "User-Agent": USER_AGENT,
            Accept: "application/geo+json",
        };

        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return (await response.json()) as T;
        } catch (error) {
            console.error("Error making NWS request:", error);
            return null;
        }
    }

    interface AlertFeature {
        properties: {
            event?: string;
            areaDesc?: string;
            severity?: string;
            status?: string;
            headline?: string;
        };
    }

    // Format alert data
    function formatAlert(feature: AlertFeature): string {
        const props = feature.properties;
        return [
            `Event: ${props.event || "Unknown"}`,
            `Area: ${props.areaDesc || "Unknown"}`,
            `Severity: ${props.severity || "Unknown"}`,
            `Status: ${props.status || "Unknown"}`,
            `Headline: ${props.headline || "No headline"}`,
            "---",
        ].join("\n");
    }

    interface ForecastPeriod {
        name?: string;
        temperature?: number;
        temperatureUnit?: string;
        windSpeed?: string;
        windDirection?: string;
        shortForecast?: string;
    }

    interface AlertsResponse {
        features: AlertFeature[];
    }

    interface PointsResponse {
        properties: {
            forecast?: string;
        };
    }

    interface ForecastResponse {
        properties: {
            periods: ForecastPeriod[];
        };
    }

    // Register weather tools
    server.tool(
        "get_alerts",
        "Get weather alerts for a state",
        {
            state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
        },
        async ({ state }) => {
            const stateCode = state.toUpperCase();
            const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
            const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

            if (!alertsData) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Failed to retrieve alerts data",
                        },
                    ],
                };
            }

            const features = alertsData.features || [];
            if (features.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `No active alerts for ${stateCode}`,
                        },
                    ],
                };
            }

            const formattedAlerts = features.map(formatAlert);
            const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join("\n")}`;

            return {
                content: [
                    {
                        type: "text",
                        text: alertsText,
                    },
                ],
            };
        },
    );

    server.tool(
        "get_forecast",
        "Get weather forecast for a location",
        {
            latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
            longitude: z
                .number()
                .min(-180)
                .max(180)
                .describe("Longitude of the location"),
        },
        async ({ latitude, longitude }) => {
            // Get grid point data
            const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
            const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

            if (!pointsData) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
                        },
                    ],
                };
            }

            const forecastUrl = pointsData.properties?.forecast;
            if (!forecastUrl) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Failed to get forecast URL from grid point data",
                        },
                    ],
                };
            }

            // Get forecast data
            const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
            if (!forecastData) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Failed to retrieve forecast data",
                        },
                    ],
                };
            }

            const periods = forecastData.properties?.periods || [];
            if (periods.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No forecast periods available",
                        },
                    ],
                };
            }

            // Format forecast periods
            const formattedForecast = periods.map((period: ForecastPeriod) =>
                [
                    `${period.name || "Unknown"}:`,
                    `Temperature: ${period.temperature || "Unknown"}°${period.temperatureUnit || "F"}`,
                    `Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}`,
                    `${period.shortForecast || "No forecast available"}`,
                    "---",
                ].join("\n"),
            );

            const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join("\n")}`;

            return {
                content: [
                    {
                        type: "text",
                        text: forecastText,
                    },
                ],
            };
        },
    );

    return server;
};

const app = express();
app.use(express.json());

// Configure CORS to expose Mcp-Session-Id header for browser-based clients
app.use(cors({
    origin: '*', // Allow all origins - adjust as needed for production
    exposedHeaders: ['Mcp-Session-Id']
}));

app.post('/mcp', async (req: Request, res: Response) => {
    const server = getServer();
    try {
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        res.on('close', () => {
            console.log('Request closed');
            transport.close();
            server.close();
        });
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            });
        }
    }
});

app.get('/mcp', async (req: Request, res: Response) => {
    console.log('Received GET MCP request');
    res.writeHead(405).end(JSON.stringify({
        jsonrpc: "2.0",
        error: {
            code: -32000,
            message: "Method not allowed."
        },
        id: null
    }));
});

app.delete('/mcp', async (req: Request, res: Response) => {
    console.log('Received DELETE MCP request');
    res.writeHead(405).end(JSON.stringify({
        jsonrpc: "2.0",
        error: {
            code: -32000,
            message: "Method not allowed."
        },
        id: null
    }));
});

// Start the server
const PORT = 3000;
app.listen(PORT, (error) => {
    if (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
    console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    process.exit(0);
});