import { Container } from "@mui/material";

export const Footer = () => {

  //randomize the order of the sponsor images

  return (
    <div>
      <Container
        maxWidth="xl"
        sx={{
          display: "flex",
          flexDirection: {
            xs: "column",
            sm: "row",
          },
          py: 1,
          "& a": {
            mt: {
              xs: 1,
              sm: 0,
            },
            "&:not(:last-child)": {
              mr: {
                xs: 0,
                sm: 2,
              },
            },
          },
        }}
      >
        <span style={{ fontSize: 12, opacity: 0.75 }}>ŌMZIG — We are best practice.</span>
        <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 'auto' }}>Built on CIPP by CyberDrain (AGPL-3.0)</span>
      </Container>
    </div>
  );
};
