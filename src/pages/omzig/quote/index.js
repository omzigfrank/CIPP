import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Container,
  Divider,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Grid } from "@mui/system";
import { ExpandMore } from "@mui/icons-material";
import { Layout as DashboardLayout } from "../../../layouts/index.js";
import { ApiGetCall, ApiPostCall } from "../../../api/ApiCall";
import { CippHead } from "../../../components/CippComponents/CippHead";
import { CippApiResults } from "../../../components/CippComponents/CippApiResults";
import { OMZIG_AI_PRODUCTS, OMZIG_COST_BASELINES } from "../../../omzig";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const formatCurrency = (value) =>
  currencyFormatter.format(Number.isFinite(Number(value)) ? Number(value) : 0);

const formatPercent = (value) =>
  `${(Number.isFinite(Number(value)) ? Number(value) * 100 : 0).toFixed(1)}%`;

const Page = () => {
  const floors = ApiGetCall({
    url: "/api/ListOmzigPricingFloors",
    queryKey: "OmzigPricingFloors",
  });

  const evaluateQuote = ApiPostCall({
    relatedQueryKeys: ["OmzigPricingFloors"],
  });

  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [techHours, setTechHours] = useState(0);
  const [vcioHours, setVcioHours] = useState(0);
  const [overrideToken, setOverrideToken] = useState("");

  // Reset the server evaluation whenever the inputs change so a stale
  // Approved/Refused verdict is never shown against a different quote.
  useEffect(() => {
    evaluateQuote.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, price, techHours, vcioHours, overrideToken]);

  const product = OMZIG_AI_PRODUCTS.find((p) => p.id === productId) || null;
  const serverFloor = floors.data?.find((f) => f.Id === productId) || null;
  const floorValue = serverFloor?.SmbFloor ?? product?.smbFloor ?? null;
  const neverDiscounted = serverFloor?.NeverDiscounted ?? product?.id === "aira";

  // Client-side preview only — mirrors the server math in
  // Test-OmzigQuoteFloor for instant feedback. The server's evaluation
  // (below) is always the authoritative verdict.
  const priceNumber = Number(price);
  const techHoursNumber = Number(techHours) || 0;
  const vcioHoursNumber = Number(vcioHours) || 0;
  const previewCost =
    techHoursNumber * OMZIG_COST_BASELINES.techLaborHourly +
    vcioHoursNumber * OMZIG_COST_BASELINES.vcioHourly;
  const previewMargin =
    Number.isFinite(priceNumber) && priceNumber > 0
      ? (priceNumber - previewCost) / priceNumber
      : null;
  const previewBelowFloor =
    Number.isFinite(priceNumber) &&
    priceNumber > 0 &&
    floorValue !== null &&
    priceNumber < floorValue;

  const canEvaluate = Boolean(productId) && Number.isFinite(priceNumber) && priceNumber > 0;

  const handleEvaluate = () => {
    evaluateQuote.mutate({
      url: "/api/ExecOmzigQuote",
      data: {
        productId,
        price: priceNumber,
        techHours: techHoursNumber,
        vcioHours: vcioHoursNumber,
        ...(overrideToken ? { overrideToken } : {}),
      },
    });
  };

  const result = evaluateQuote.isSuccess ? evaluateQuote.data?.data : null;
  const showAiraNeverDiscountedCopy =
    result && result.Approved === false && result.ProductId === "aira" && Boolean(overrideToken);

  return (
    <>
      <CippHead title="Quote Engine" noTenant />
      <Box sx={{ flexGrow: 1 }}>
        <Container maxWidth="md">
          <Stack spacing={2}>
            <Card>
              <CardHeader
                title="ŌMZIG Quote Engine"
                subheader="Evaluate an AI product quote against the §3 pricing floors and 70% gross margin floor"
              />
              <CardContent>
                {floors.isLoading ? (
                  <Skeleton variant="rounded" height={280} />
                ) : (
                  <Stack spacing={3}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">
                          Product
                        </Typography>
                        <Select
                          fullWidth
                          size="small"
                          displayEmpty
                          value={productId}
                          onChange={(e) => setProductId(e.target.value)}
                        >
                          <MenuItem value="" disabled>
                            Select a product
                          </MenuItem>
                          {OMZIG_AI_PRODUCTS.map((p) => (
                            <MenuItem key={p.id} value={p.id}>
                              {p.label}
                            </MenuItem>
                          ))}
                        </Select>
                        {product && (
                          <Typography variant="caption" color="text.secondary">
                            {product.purpose}
                          </Typography>
                        )}
                      </Grid>

                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">
                          Price {product?.recurring ? "(monthly)" : ""}
                        </Typography>
                        <TextField
                          fullWidth
                          size="small"
                          type="number"
                          placeholder="0.00"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          slotProps={{ htmlInput: { min: 0, step: "0.01" } }}
                        />
                      </Grid>

                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">
                          Tech hours
                        </Typography>
                        <TextField
                          fullWidth
                          size="small"
                          type="number"
                          value={techHours}
                          onChange={(e) => setTechHours(e.target.value)}
                          slotProps={{ htmlInput: { min: 0, step: "0.5" } }}
                        />
                      </Grid>

                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">
                          vCIO hours
                        </Typography>
                        <TextField
                          fullWidth
                          size="small"
                          type="number"
                          value={vcioHours}
                          onChange={(e) => setVcioHours(e.target.value)}
                          slotProps={{ htmlInput: { min: 0, step: "0.5" } }}
                        />
                      </Grid>
                    </Grid>

                    <Accordion variant="outlined">
                      <AccordionSummary expandIcon={<ExpandMore />}>
                        <Typography variant="body2">Executive override token</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <TextField
                          fullWidth
                          size="small"
                          type="password"
                          label="Executive override token"
                          helperText="Frank-signed override for a below-floor quote. AIRA can never be discounted, even with a valid token."
                          value={overrideToken}
                          onChange={(e) => setOverrideToken(e.target.value)}
                        />
                      </AccordionDetails>
                    </Accordion>

                    <Divider />

                    {/* Live preview — client-side only, for instant feedback */}
                    <Card variant="outlined">
                      <CardHeader
                        title="Preview"
                        subheader="Client-side estimate — the server's evaluation below is authoritative"
                        titleTypographyProps={{ variant: "subtitle1" }}
                      />
                      <CardContent>
                        {!product || !Number.isFinite(priceNumber) || priceNumber <= 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            Select a product and enter a price to see a preview.
                          </Typography>
                        ) : (
                          <Stack spacing={1}>
                            <Stack direction="row" justifyContent="space-between">
                              <Typography variant="body2" color="text.secondary">
                                Estimated cost
                              </Typography>
                              <Typography variant="body2">
                                {formatCurrency(previewCost)}
                              </Typography>
                            </Stack>
                            <Stack direction="row" justifyContent="space-between">
                              <Typography variant="body2" color="text.secondary">
                                Estimated gross margin
                              </Typography>
                              <Typography variant="body2">
                                {previewMargin === null ? "—" : formatPercent(previewMargin)}
                              </Typography>
                            </Stack>
                            <Stack direction="row" justifyContent="space-between">
                              <Typography variant="body2" color="text.secondary">
                                Pricing floor
                              </Typography>
                              <Typography variant="body2">
                                {floorValue !== null ? formatCurrency(floorValue) : "—"}
                              </Typography>
                            </Stack>
                            {previewBelowFloor && (
                              <Alert severity="warning" variant="outlined">
                                Preview: price is below the {product.label} floor of{" "}
                                {formatCurrency(floorValue)}.
                              </Alert>
                            )}
                          </Stack>
                        )}
                      </CardContent>
                    </Card>

                    <Box>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={handleEvaluate}
                        disabled={!canEvaluate || evaluateQuote.isPending}
                      >
                        {evaluateQuote.isPending ? "Evaluating..." : "Evaluate quote"}
                      </Button>
                    </Box>

                    <CippApiResults apiObject={evaluateQuote} errorsOnly />

                    {/* Server verdict — authoritative */}
                    {result && (
                      <Card variant="outlined">
                        <CardContent>
                          <Stack spacing={2}>
                            <Stack
                              direction="row"
                              spacing={1.5}
                              alignItems="center"
                              justifyContent="space-between"
                            >
                              <Typography variant="h6">Server evaluation</Typography>
                              <Chip
                                label={result.Approved ? "Approved" : "Refused"}
                                color={result.Approved ? "success" : "error"}
                                sx={{ fontWeight: 700, fontSize: "1rem", px: 1 }}
                              />
                            </Stack>

                            <Grid container spacing={2}>
                              <Grid size={{ xs: 6, sm: 3 }}>
                                <Typography variant="caption" color="text.secondary">
                                  Gross margin
                                </Typography>
                                <Typography variant="body1">
                                  {formatPercent(result.GrossMargin)}
                                </Typography>
                              </Grid>
                              <Grid size={{ xs: 6, sm: 3 }}>
                                <Typography variant="caption" color="text.secondary">
                                  Cost
                                </Typography>
                                <Typography variant="body1">
                                  {formatCurrency(result.Cost)}
                                </Typography>
                              </Grid>
                              <Grid size={{ xs: 6, sm: 3 }}>
                                <Typography variant="caption" color="text.secondary">
                                  Floor
                                </Typography>
                                <Typography variant="body1">
                                  {formatCurrency(result.Floor)}
                                </Typography>
                              </Grid>
                              <Grid size={{ xs: 6, sm: 3 }}>
                                <Typography variant="caption" color="text.secondary">
                                  Override token
                                </Typography>
                                <Typography variant="body1">
                                  {overrideToken ? (result.OverrideValid ? "Valid" : "Invalid") : "—"}
                                </Typography>
                              </Grid>
                            </Grid>

                            {showAiraNeverDiscountedCopy && (
                              <Alert severity="error">AIRA is never discounted.</Alert>
                            )}

                            {Array.isArray(result.Violations) && result.Violations.length > 0 && (
                              <Stack spacing={1}>
                                {result.Violations.map((violation, index) => (
                                  <Alert key={index} severity="error" variant="outlined">
                                    {violation}
                                  </Alert>
                                ))}
                              </Stack>
                            )}
                          </Stack>
                        </CardContent>
                      </Card>
                    )}
                  </Stack>
                )}
              </CardContent>
            </Card>

            {floors.isError && (
              <Alert severity="error">Unable to load the ŌMZIG pricing floors.</Alert>
            )}
          </Stack>
        </Container>
      </Box>
    </>
  );
};

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>;

export default Page;
