import { useMemo, useState } from "react";
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
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Grid } from "@mui/system";
import { ExpandMore } from "@mui/icons-material";
import { Layout as DashboardLayout } from "../../../layouts/index.js";
import { ApiGetCallWithPagination, ApiPostCall } from "../../../api/ApiCall";
import { CippHead } from "../../../components/CippComponents/CippHead";
import { CippApiResults } from "../../../components/CippComponents/CippApiResults";
import { OMZIG_GDAP_BUNDLES, getVertical } from "../../../omzig";

const apiUrl = "/api/ExecGDAPRoleTemplate";
const queryKey = "ListGDAPRoleTemplates";

const Page = () => {
  const templatesQuery = ApiGetCallWithPagination({
    url: apiUrl,
    queryKey,
  });

  const importTemplate = ApiPostCall({
    relatedQueryKeys: [queryKey],
  });

  // Which bundle the in-flight (or most recently completed) mutation belongs
  // to, so only that bundle's button/result reflects the mutation state —
  // the underlying mutation object is shared across every "Import" button.
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [importAllSummary, setImportAllSummary] = useState(null);
  const [importAllRunning, setImportAllRunning] = useState(false);

  const importedTemplateIds = useMemo(() => {
    const ids = new Set();
    templatesQuery.data?.pages?.forEach((page) => {
      (page?.Results || []).forEach((template) => {
        if (template?.TemplateId) {
          ids.add(template.TemplateId);
        }
      });
    });
    return ids;
  }, [templatesQuery.data]);

  const statusKnown = templatesQuery.isSuccess;
  const notYetImported = statusKnown
    ? OMZIG_GDAP_BUNDLES.filter((bundle) => !importedTemplateIds.has(bundle.TemplateId))
    : [];

  const buildPayload = (bundle) => ({
    TemplateId: bundle.TemplateId,
    RoleMappings: bundle.RoleMappings,
  });

  const handleImport = (bundle) => {
    setImportAllSummary(null);
    setActiveTemplateId(bundle.TemplateId);
    importTemplate.mutate({
      url: `${apiUrl}?Action=Add`,
      data: buildPayload(bundle),
    });
  };

  const handleImportAll = async () => {
    if (notYetImported.length === 0 || importAllRunning) {
      return;
    }
    setImportAllSummary(null);
    setImportAllRunning(true);

    const succeeded = [];
    const failed = [];
    for (const bundle of notYetImported) {
      setActiveTemplateId(bundle.TemplateId);
      try {
        await importTemplate.mutateAsync({
          url: `${apiUrl}?Action=Add`,
          data: buildPayload(bundle),
        });
        succeeded.push(bundle.TemplateId);
      } catch (e) {
        failed.push(bundle.TemplateId);
      }
    }

    setImportAllRunning(false);
    setImportAllSummary({ succeeded, failed });
  };

  const isBusy = importTemplate.isPending || importAllRunning;

  return (
    <>
      <CippHead title="GDAP Vertical Bundles" noTenant />
      <Box sx={{ flexGrow: 1 }}>
        <Container maxWidth="lg">
          <Stack spacing={2}>
            <Card>
              <CardHeader
                title="ŌMZIG GDAP Vertical Bundle Importer"
                subheader="Import the §6.1 / §17 item 10 vertical GDAP role bundles into the standard GDAP Role Templates library. Re-import is safe — Add merges missing roles by roleDefinitionId and never removes an existing role."
              />
              <CardContent>
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    justifyContent="space-between"
                  >
                    <Typography variant="body2" color="text.secondary">
                      {statusKnown
                        ? `${OMZIG_GDAP_BUNDLES.length - notYetImported.length} of ${
                            OMZIG_GDAP_BUNDLES.length
                          } bundles already imported`
                        : "Import status unavailable until the template list loads"}
                    </Typography>
                    <Tooltip
                      title={
                        statusKnown && notYetImported.length === 0
                          ? "Every bundle is already imported"
                          : ""
                      }
                    >
                      <span>
                        <Button
                          variant="contained"
                          onClick={handleImportAll}
                          disabled={!statusKnown || notYetImported.length === 0 || isBusy}
                        >
                          {importAllRunning
                            ? "Importing all..."
                            : `Import all (${notYetImported.length} remaining)`}
                        </Button>
                      </span>
                    </Tooltip>
                  </Stack>

                  {templatesQuery.isError && (
                    <Alert severity="error">
                      Unable to load existing GDAP role templates. Import status below is unknown,
                      but importing is still safe — Add merges by roleDefinitionId.
                    </Alert>
                  )}

                  {importAllSummary && (
                    <Alert severity={importAllSummary.failed.length > 0 ? "warning" : "success"}>
                      Import all finished: {importAllSummary.succeeded.length} succeeded
                      {importAllSummary.failed.length > 0
                        ? `, ${importAllSummary.failed.length} failed (${importAllSummary.failed.join(", ")})`
                        : ""}
                      .
                    </Alert>
                  )}
                </Stack>
              </CardContent>
            </Card>

            {templatesQuery.isLoading ? (
              <Grid container spacing={2}>
                {[0, 1, 2].map((i) => (
                  <Grid key={i} size={{ xs: 12, md: 6 }}>
                    <Skeleton variant="rounded" height={220} />
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Grid container spacing={2}>
                {OMZIG_GDAP_BUNDLES.map((bundle) => {
                  const vertical = getVertical(bundle.Vertical);
                  const imported = importedTemplateIds.has(bundle.TemplateId);
                  const isThisBundleActive = activeTemplateId === bundle.TemplateId;

                  return (
                    <Grid key={bundle.TemplateId} size={{ xs: 12, md: 6 }}>
                      <Card sx={{ height: "100%" }}>
                        <CardHeader
                          title={bundle.TemplateId}
                          subheader={vertical ? vertical.label : bundle.Vertical}
                          action={
                            <Chip
                              size="small"
                              label={
                                !statusKnown ? "Status unknown" : imported ? "Imported" : "Not imported"
                              }
                              color={!statusKnown ? "default" : imported ? "success" : "warning"}
                              variant={!statusKnown ? "outlined" : "filled"}
                            />
                          }
                        />
                        <CardContent>
                          <Stack spacing={2}>
                            <Typography variant="body2" color="text.secondary">
                              {bundle.Description}
                            </Typography>

                            <Stack direction="row" justifyContent="space-between">
                              <Typography variant="caption" color="text.secondary">
                                Role mappings
                              </Typography>
                              <Typography variant="caption">
                                {bundle.RoleMappings.length}
                              </Typography>
                            </Stack>

                            <Accordion variant="outlined">
                              <AccordionSummary expandIcon={<ExpandMore />}>
                                <Typography variant="body2">
                                  View {bundle.RoleMappings.length} role mappings
                                </Typography>
                              </AccordionSummary>
                              <AccordionDetails>
                                <Stack spacing={1} divider={<Divider flexItem />}>
                                  {bundle.RoleMappings.map((mapping) => (
                                    <Stack
                                      key={mapping.roleDefinitionId}
                                      direction={{ xs: "column", sm: "row" }}
                                      justifyContent="space-between"
                                    >
                                      <Typography variant="body2">{mapping.RoleName}</Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {mapping.GroupName}
                                      </Typography>
                                    </Stack>
                                  ))}
                                </Stack>
                              </AccordionDetails>
                            </Accordion>

                            <Divider />

                            <Box>
                              <Button
                                variant={imported ? "outlined" : "contained"}
                                onClick={() => handleImport(bundle)}
                                disabled={isBusy}
                              >
                                {isThisBundleActive && importTemplate.isPending
                                  ? "Importing..."
                                  : imported
                                    ? "Re-import (merge)"
                                    : "Import"}
                              </Button>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block", mt: 0.5 }}
                              >
                                {imported
                                  ? "Re-import merges any missing roles into the existing template; it never removes roles already assigned."
                                  : "Adds this bundle as a new GDAP role template."}
                              </Typography>
                            </Box>

                            {isThisBundleActive && (
                              <CippApiResults apiObject={importTemplate} />
                            )}
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Stack>
        </Container>
      </Box>
    </>
  );
};

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>;

export default Page;
